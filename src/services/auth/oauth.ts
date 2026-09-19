/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { getApiBaseUrl } from '@/services/api';
import { getBasePath } from '@/lib/basePath';
import { getOAuthClientId } from '@/lib/oauthClientId';
import i18n from '@/i18n';

const SCOPES = import.meta.env.VITE_OAUTH_SCOPES as string | undefined;

const SESSION_PREFIX = 'inbuxa-oauth-';

interface DiscoveryResponse {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
}

/**
 * The server's OAuth endpoints.
 *
 * Upstream asks for the account name first and looks the endpoints up per
 * account, because a domain there can sign in at its own identity provider.
 * INBUXA Admin talks to one known server whose own sign-in page handles every
 * account, so it reads the server's published OpenID configuration instead,
 * which needs no account name. Given one, it still asks per account.
 */
export async function discover(username?: string | null): Promise<DiscoveryResponse> {
  const url = username
    ? `${getApiBaseUrl()}/api/discover/${encodeURIComponent(username)}`
    : `${getApiBaseUrl()}/.well-known/openid-configuration`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      i18n.t('oauth.discoveryFailed', 'Discovery failed for "{{username}}": {{status}} {{statusText}}', {
        username: username ?? getApiBaseUrl(),
        status: response.status,
        statusText: response.statusText,
      }),
    );
  }
  const discovered = (await response.json()) as DiscoveryResponse;
  // A server that doesn't know its public URL yet (bootstrap mode, or no
  // public URL configured) returns relative endpoints such as "/login". They
  // belong to the server, so resolve them against the server's address, not
  // this page's: INBUXA Admin is usually served from somewhere else.
  const base = `${getApiBaseUrl()}/`;
  const absolute = (endpoint: string | undefined) => (endpoint ? new URL(endpoint, base).toString() : endpoint);
  return {
    ...discovered,
    authorization_endpoint: absolute(discovered.authorization_endpoint) as string,
    token_endpoint: absolute(discovered.token_endpoint) as string,
    end_session_endpoint: absolute(discovered.end_session_endpoint),
  };
}

const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

export function generateCodeVerifier(length: number = 64): string {
  if (length < 43 || length > 128) {
    throw new Error(`code_verifier length must be 43-128, got ${length}`);
  }

  const out: string[] = [];
  while (out.length < length) {
    const buf = new Uint8Array(length * 2);
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const b = buf[i];
      if (b < 198) {
        out.push(UNRESERVED[b % 66]);
      }
    }
  }
  return out.join('');
}

export async function generateCodeChallenge(
  verifier: string,
): Promise<{ challenge: string; method: 'S256' | 'plain' }> {
  if (typeof crypto === 'undefined' || typeof crypto.subtle === 'undefined') {
    return { challenge: verifier, method: 'plain' };
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return { challenge: base64UrlEncode(new Uint8Array(digest)), method: 'S256' };
}

function generateState(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function base64UrlEncode(bytes: Uint8Array): string {
  const binString = Array.from(bytes, (b) => String.fromCodePoint(b)).join('');
  return btoa(binString).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export async function exchangeCode(
  code: string,
  codeVerifier: string,
  tokenEndpoint: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    client_id: getOAuthClientId(),
    redirect_uri: redirectUri,
  });

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(
      i18n.t('oauth.tokenExchangeFailed', 'Token exchange failed: {{status}} {{statusText}}', {
        status: response.status,
        statusText: response.statusText,
      }),
    );
  }

  return response.json() as Promise<TokenResponse>;
}

function getRedirectUri(): string {
  const basePath = getBasePath();
  return `${window.location.origin}${basePath}/oauth/callback`;
}

export async function startAuthFlow(username: string | null, returnUrl?: string | null): Promise<void> {
  const { authorization_endpoint, token_endpoint, end_session_endpoint, scopes_supported } = await discover(username);

  const codeVerifier = generateCodeVerifier();
  const { challenge: codeChallenge, method: codeChallengeMethod } = await generateCodeChallenge(codeVerifier);
  const state = generateState();

  const candidate = returnUrl ?? window.location.pathname + window.location.search;
  const basePath = getBasePath();
  const stripped = candidate.startsWith(basePath) ? candidate.slice(basePath.length) : candidate;
  const isAuthPath =
    stripped === '/login' ||
    stripped.startsWith('/login?') ||
    stripped === '/oauth/callback' ||
    stripped.startsWith('/oauth/callback?');
  const safeReturnUrl = isAuthPath ? '' : candidate;

  sessionStorage.setItem(`${SESSION_PREFIX}code_verifier`, codeVerifier);
  sessionStorage.setItem(`${SESSION_PREFIX}token_endpoint`, token_endpoint);
  sessionStorage.setItem(`${SESSION_PREFIX}state`, state);
  sessionStorage.setItem(`${SESSION_PREFIX}return_url`, safeReturnUrl);
  if (end_session_endpoint) {
    sessionStorage.setItem(`${SESSION_PREFIX}end_session_endpoint`, end_session_endpoint);
  } else {
    sessionStorage.removeItem(`${SESSION_PREFIX}end_session_endpoint`);
  }

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: getOAuthClientId(),
    redirect_uri: getRedirectUri(),
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    state,
    prompt: 'login',
  });
  if (username) {
    params.set('login_hint', username);
  }

  let scope: string;
  if (SCOPES && SCOPES.length > 0) {
    scope = SCOPES;
  } else if (scopes_supported?.includes('openid')) {
    scope = ['openid', 'email', 'profile', 'offline_access'].filter((s) => scopes_supported.includes(s)).join(' ');
  } else {
    scope = '';
  }
  if (scope) {
    params.set('scope', scope);
  }

  window.location.href = `${authorization_endpoint}?${params.toString()}`;
}

export function getStoredOAuthData() {
  return {
    codeVerifier: sessionStorage.getItem(`${SESSION_PREFIX}code_verifier`),
    tokenEndpoint: sessionStorage.getItem(`${SESSION_PREFIX}token_endpoint`),
    state: sessionStorage.getItem(`${SESSION_PREFIX}state`),
    returnUrl: sessionStorage.getItem(`${SESSION_PREFIX}return_url`),
    endSessionEndpoint: sessionStorage.getItem(`${SESSION_PREFIX}end_session_endpoint`),
  };
}

export function clearStoredOAuthData(): void {
  sessionStorage.removeItem(`${SESSION_PREFIX}code_verifier`);
  sessionStorage.removeItem(`${SESSION_PREFIX}token_endpoint`);
  sessionStorage.removeItem(`${SESSION_PREFIX}state`);
  sessionStorage.removeItem(`${SESSION_PREFIX}return_url`);
  sessionStorage.removeItem(`${SESSION_PREFIX}end_session_endpoint`);
}

export function getOAuthRedirectUri(): string {
  return getRedirectUri();
}

export function getPostLogoutRedirectUri(): string {
  const basePath = getBasePath();
  return `${window.location.origin}${basePath}/login`;
}

export function buildEndSessionUrl(endSessionEndpoint: string, postLogoutRedirectUri: string): string {
  const params = new URLSearchParams({
    client_id: getOAuthClientId(),
    post_logout_redirect_uri: postLogoutRedirectUri,
  });
  const sep = endSessionEndpoint.includes('?') ? '&' : '?';
  return `${endSessionEndpoint}${sep}${params.toString()}`;
}
