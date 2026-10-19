/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Requests to the server, signed with the admin's access token, which is
 * refreshed before it runs out and again if the server says 401.
 *
 * Only a refusal from the token endpoint ends the session. No answer, a 5xx,
 * rate limiting or a proxy's error page leave the admin signed in on the
 * page, with a note that the server can't be reached (connectionStore), and
 * the refresh is tried again on its own.
 */
import { getOAuthClientId } from '@/lib/oauthClientId';

import { useAuthStore } from '../stores/authStore';
import { useConnectionStore } from '../stores/connectionStore';
import { endSession } from './auth/session';

const withoutTrailingSlash = (url: string) => url.replace(/\/+$/, '');

/**
 * The server's address: VITE_API_BASE_URL in development, else
 * <meta name="api-base-url"> (set when the console is deployed, so one build
 * fits any server), else the console's own origin (served by the server).
 */
export function getApiBaseUrl(): string {
  const configured =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
    document.querySelector('meta[name="api-base-url"]')?.getAttribute('content')?.trim();
  return configured ? withoutTrailingSlash(configured) : window.location.origin;
}

/** A request the server answered with an error status; `body` is its JSON, if any. */
export class ApiError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: unknown;

  constructor(status: number, statusText: string, body: unknown) {
    super(`API error ${status}: ${statusText}`);
    this.name = 'ApiError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
  }
}

// --- Retrying a refresh the server didn't answer ---------------------------

/** After 5, 10 and 20 seconds, then every minute; and at once when the browser is back online. */
const RETRY_AFTER_MS = [5_000, 10_000, 20_000, 60_000];
let retries = 0;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let watchingOnline = false;

function cantReachServer(): void {
  useConnectionStore.getState().setUnreachable(true);
  if (!watchingOnline) {
    watchingOnline = true;
    window.addEventListener('online', () => {
      if (useConnectionStore.getState().unreachable) retryRefresh();
    });
  }
  if (retryTimer) return;
  retryTimer = setTimeout(
    () => {
      retryTimer = undefined;
      retryRefresh();
    },
    RETRY_AFTER_MS[Math.min(retries++, RETRY_AFTER_MS.length - 1)],
  );
}

function reachedServer(): void {
  retries = 0;
  clearTimeout(retryTimer);
  retryTimer = undefined;
  useConnectionStore.getState().setUnreachable(false);
}

/** Tries the refresh again now: the retry timer, the browser coming back online, or the reader's "Try now". */
export function retryRefresh(): void {
  if (useAuthStore.getState().refreshToken) refreshAccessToken().catch(() => {});
  else reachedServer();
}

// --- Refreshing the access token --------------------------------------------

/** The token endpoint turned the refresh token down (spent, revoked, the account locked): the session is over. */
const isRefusal = (status: number) => status === 400 || status === 401 || status === 403;

async function refreshOnce(): Promise<void> {
  const { refreshToken, tokenEndpoint } = useAuthStore.getState();
  if (!refreshToken || !tokenEndpoint) {
    reachedServer();
    endSession();
    throw new Error('No refresh token or token endpoint available');
  }

  let res: Response;
  try {
    res = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: getOAuthClientId(),
      }),
    });
  } catch (err) {
    // No answer: a dropped connection, the server restarting, a laptop waking up.
    cantReachServer();
    throw err;
  }

  if (!res.ok) {
    if (isRefusal(res.status)) {
      reachedServer();
      endSession();
    } else {
      cantReachServer();
    }
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  let answer: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    answer = await res.json();
  } catch (err) {
    // A proxy's error page, not the server's answer.
    cantReachServer();
    throw err;
  }
  if (typeof answer.access_token !== 'string' || typeof answer.expires_in !== 'number') {
    cantReachServer();
    throw new Error('Token refresh answered without a token');
  }

  // The server may rotate the refresh token; if it didn't send one, the old one stays good.
  const nextRefresh = typeof answer.refresh_token === 'string' ? answer.refresh_token : refreshToken;
  useAuthStore.getState().setTokens(answer.access_token, nextRefresh, answer.expires_in, tokenEndpoint);
  reachedServer();
}

let refreshing: Promise<void> | null = null;

/** Refreshes the access token; callers that ask while a refresh is under way share it. */
export async function refreshAccessToken(): Promise<void> {
  refreshing ??= refreshOnce().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

// --- Requests ---------------------------------------------------------------

/**
 * Fetches `path` on the server with the access token. Refreshes first when
 * the token is about to run out, and once more on a 401. Throws ApiError for
 * any error status.
 */
export async function apiFetch(path: string, options?: RequestInit): Promise<Response> {
  const auth = useAuthStore.getState();
  if (auth.isTokenExpiringSoon() && auth.refreshToken) {
    try {
      await refreshAccessToken();
    } catch (err) {
      // Not refreshed yet, but a token that hasn't run out still works.
      if (!useAuthStore.getState().isAuthenticated()) throw err;
    }
  }

  const send = () => {
    const headers = new Headers(options?.headers);
    const { accessToken } = useAuthStore.getState();
    if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
    return fetch(`${getApiBaseUrl()}${path}`, { ...options, headers, redirect: 'follow' });
  };

  let res = await send();
  if (res.status === 401) {
    if (!useAuthStore.getState().refreshToken) {
      endSession();
      throw new ApiError(401, 'Unauthorized', null);
    }
    try {
      await refreshAccessToken();
    } catch (err) {
      // If the server can't be reached, say that, not 401.
      if (useConnectionStore.getState().unreachable) throw err;
      throw new ApiError(401, 'Unauthorized', null);
    }
    res = await send();
  }

  if (!res.ok) {
    const body: unknown = await res.json().catch(() => null);
    throw new ApiError(res.status, res.statusText, body);
  }
  return res;
}
