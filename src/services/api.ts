/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { endSession } from './auth/session';
import { getOAuthClientId } from '@/lib/oauthClientId';

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (envUrl && envUrl.length > 0) {
    return envUrl.replace(/\/+$/, '');
  }
  // Set at deploy time rather than build time, so one build can point at any
  // server: <meta name="api-base-url" content="https://mail.example.com">.
  const injected = document.querySelector('meta[name="api-base-url"]')?.getAttribute('content')?.trim();
  if (injected) {
    return injected.replace(/\/+$/, '');
  }
  return window.location.origin;
}

export class ApiError extends Error {
  status: number;
  statusText: string;
  body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

let refreshPromise: Promise<void> | null = null;

/**
 * inbuxa: the token endpoint turned the refresh token down (spent, revoked,
 * or the account locked), so the session is over. Anything else, no answer
 * at all, a 5xx or rate limiting, passes, and signing out over it would lose
 * the page and whatever was typed into it.
 */
function isRefusal(status: number): boolean {
  return status === 400 || status === 401 || status === 403;
}

// inbuxa: a refresh that failed without a refusal is tried again on its own:
// after 5, 10 and 20 seconds, then every minute, and at once when the browser
// says it is back online.
const RETRY_DELAYS = [5_000, 10_000, 20_000, 60_000];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryCount = 0;
let listeningForOnline = false;

/** Try the refresh again now, as the retry timer, the browser coming online or the reader would. */
export function retryRefresh(): void {
  if (!useAuthStore.getState().refreshToken) {
    stopRetrying();
    return;
  }
  refreshAccessToken().catch(() => {});
}

function serverUnreachable(): void {
  useConnectionStore.getState().setUnreachable(true);
  if (!listeningForOnline) {
    listeningForOnline = true;
    window.addEventListener('online', () => {
      if (useConnectionStore.getState().unreachable) retryRefresh();
    });
  }
  if (retryTimer) return;
  const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
  retryCount += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryRefresh();
  }, delay);
}

function stopRetrying(): void {
  retryCount = 0;
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  useConnectionStore.getState().setUnreachable(false);
}

export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { refreshToken, tokenEndpoint } = useAuthStore.getState();

    if (!refreshToken || !tokenEndpoint) {
      stopRetrying();
      endSession();
      throw new Error('No refresh token or token endpoint available');
    }

    const clientId = getOAuthClientId();

    let response: Response;
    try {
      response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      });
    } catch (error) {
      // No answer: a dropped connection, the server restarting, a laptop waking up.
      serverUnreachable();
      throw error;
    }

    if (!response.ok) {
      if (isRefusal(response.status)) {
        stopRetrying();
        endSession();
      } else {
        serverUnreachable();
      }
      throw new Error(`Token refresh failed: ${response.status}`);
    }

    let data: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
    try {
      data = await response.json();
    } catch (error) {
      // A proxy's error page rather than the server's answer.
      serverUnreachable();
      throw error;
    }
    if (typeof data.access_token !== 'string' || typeof data.expires_in !== 'number') {
      serverUnreachable();
      throw new Error('Token refresh answered without a token');
    }

    useAuthStore
      .getState()
      .setTokens(
        data.access_token,
        typeof data.refresh_token === 'string' ? data.refresh_token : refreshToken,
        data.expires_in,
        tokenEndpoint,
      );
    stopRetrying();
  })();

  try {
    await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const store = useAuthStore.getState();

  if (store.isTokenExpiringSoon() && store.refreshToken) {
    try {
      await refreshAccessToken();
    } catch (error) {
      // inbuxa: not refreshed yet, but a token that hasn't run out still works.
      if (!useAuthStore.getState().isAuthenticated()) throw error;
    }
  }

  const makeRequest = async (): Promise<Response> => {
    const { accessToken } = useAuthStore.getState();
    const url = `${getApiBaseUrl()}${path}`;

    const headers = new Headers(options?.headers);
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }

    const response = await fetch(url, {
      ...options,
      headers,
      redirect: 'follow',
    });

    return response;
  };

  let response = await makeRequest();

  if (response.status === 401) {
    if (useAuthStore.getState().refreshToken) {
      try {
        await refreshAccessToken();
      } catch (error) {
        // inbuxa: the server can't be reached; that, not a 401, is what happened.
        if (useConnectionStore.getState().unreachable) throw error;
        throw new ApiError(401, 'Unauthorized', null);
      }
      response = await makeRequest();
    } else {
      endSession();
      throw new ApiError(401, 'Unauthorized', null);
    }
  }

  if (!response.ok) {
    let body: unknown = null;
    try {
      body = await response.json();
      // eslint-disable-next-line no-empty
    } catch {}
    throw new ApiError(response.status, response.statusText, body);
  }

  return response;
}
