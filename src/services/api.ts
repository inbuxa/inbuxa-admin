/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useAuthStore } from '../stores/authStore';
import { getBasePath } from '@/lib/basePath';
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

export async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const { refreshToken, tokenEndpoint, logout } = useAuthStore.getState();

    if (!refreshToken || !tokenEndpoint) {
      logout();
      window.location.href = `${getBasePath()}/login`;
      throw new Error('No refresh token or token endpoint available');
    }

    const clientId = getOAuthClientId();

    try {
      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();
      useAuthStore
        .getState()
        .setTokens(data.access_token, data.refresh_token ?? refreshToken, data.expires_in, tokenEndpoint);
    } catch (error) {
      useAuthStore.getState().logout();
      window.location.href = `${getBasePath()}/login`;
      throw error;
    }
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
    await refreshAccessToken();
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
        response = await makeRequest();
      } catch {
        throw new ApiError(401, 'Unauthorized', null);
      }
    } else {
      useAuthStore.getState().logout();
      window.location.href = `${getBasePath()}/login`;
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
