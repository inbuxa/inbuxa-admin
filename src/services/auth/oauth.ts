/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Signing in with OAuth 2.0: the authorization code flow with PKCE (RFC
 * 7636, always S256), against the server's own sign-in page.
 *
 * 1. startAuthFlow() finds the server's endpoints, keeps the verifier, state
 *    and return path in sessionStorage, and sends the browser to sign in.
 * 2. The server sends it back to /oauth/callback with a code, which
 *    OAuthCallback trades for tokens with exchangeCode().
 */
import i18n from '@/i18n';
import { getBasePath } from '@/lib/basePath';
import { getOAuthClientId } from '@/lib/oauthClientId';
import { sha256 } from '@/lib/sha256';
import { getApiBaseUrl } from '@/services/api';

interface DiscoveryResponse {
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  scopes_supported?: string[];
}

interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * The server's OAuth endpoints, from its published OpenID configuration. The
 * console talks to one server whose sign-in page serves every account, so no
 * account name is needed; given one, the server's per-account lookup answers.
 *
 * A server that doesn't know its public URL yet (setup mode) answers with
 * relative endpoints such as "/login". Those are the server's, so they are
 * resolved against the server's address, not the console's.
 */
export async function discover(username?: string | null): Promise<DiscoveryResponse> {
  const server = getApiBaseUrl();
  const res = await fetch(
    username ? `${server}/api/discover/${encodeURIComponent(username)}` : `${server}/.well-known/openid-configuration`,
  );
  if (!res.ok) {
    throw new Error(
      i18n.t('oauth.discoveryFailed', 'Discovery failed for "{{username}}": {{status}} {{statusText}}', {
        username: username ?? server,
        status: res.status,
        statusText: res.statusText,
      }),
    );
  }
  const found = (await res.json()) as DiscoveryResponse;
  const onServer = (url: string) => new URL(url, `${server}/`).toString();
  return {
    ...found,
    authorization_endpoint: onServer(found.authorization_endpoint),
    token_endpoint: onServer(found.token_endpoint),
    end_session_endpoint: found.end_session_endpoint ? onServer(found.end_session_endpoint) : undefined,
  };
}

// RFC 3986's unreserved characters, the only ones a code verifier may use.
const VERIFIER_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
// Random bytes at or above this are dropped, so every character is equally likely.
const UNBIASED_BELOW = 256 - (256 % VERIFIER_ALPHABET.length);

/** A random PKCE code verifier, 43–128 characters long. */
export function generateCodeVerifier(length = 64): string {
  if (!Number.isInteger(length) || length < 43 || length > 128) {
    throw new Error(`code_verifier length must be 43-128, got ${length}`);
  }
  let verifier = '';
  while (verifier.length < length) {
    for (const byte of crypto.getRandomValues(new Uint8Array(length))) {
      if (byte < UNBIASED_BELOW && verifier.length < length) {
        verifier += VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length];
      }
    }
  }
  return verifier;
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

/**
 * The S256 challenge for a verifier. Browsers leave out crypto.subtle on
 * plain-HTTP pages (a console on a LAN address); there the digest comes from
 * our own SHA-256, never the `plain` method, which would send the verifier
 * itself.
 */
export async function generateCodeChallenge(verifier: string): Promise<{ challenge: string; method: 'S256' }> {
  const bytes = new TextEncoder().encode(verifier);
  const digest = globalThis.crypto?.subtle
    ? new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    : sha256(bytes);
  return { challenge: base64Url(digest), method: 'S256' };
}

/** 128 random bits, as hex: ties the callback to the sign-in this browser started. */
function newState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
}

// What a sign-in in progress keeps until the callback, in sessionStorage
// under `inbuxa-oauth-<name>`.
const PENDING = ['code_verifier', 'token_endpoint', 'state', 'return_url', 'end_session_endpoint'] as const;
type Pending = (typeof PENDING)[number];
const pendingKey = (name: Pending) => `inbuxa-oauth-${name}`;

export function getStoredOAuthData() {
  const read = (name: Pending) => sessionStorage.getItem(pendingKey(name));
  return {
    codeVerifier: read('code_verifier'),
    tokenEndpoint: read('token_endpoint'),
    state: read('state'),
    returnUrl: read('return_url'),
    endSessionEndpoint: read('end_session_endpoint'),
  };
}

export function clearStoredOAuthData(): void {
  for (const name of PENDING) sessionStorage.removeItem(pendingKey(name));
}

const consoleUrl = (path: string) => `${window.location.origin}${getBasePath()}${path}`;

/** Where the server sends the browser back after sign-in. */
export const getOAuthRedirectUri = (): string => consoleUrl('/oauth/callback');

/** Where the server sends the browser after signing out there. */
export const getPostLogoutRedirectUri = (): string => consoleUrl('/login');

/** The page to come back to: the one given, else the current one, but never the sign-in pages themselves. */
function returnPath(requested: string | null | undefined): string {
  const path = requested ?? window.location.pathname + window.location.search;
  const base = getBasePath();
  const route = path.startsWith(base) ? path.slice(base.length) : path;
  const isSignInPage = ['/login', '/oauth/callback'].some((p) => route === p || route.startsWith(`${p}?`));
  return isSignInPage ? '' : path;
}

/** The scopes to ask for: VITE_OAUTH_SCOPES if set, else the OpenID ones the server offers. */
function scopesFor(offered: string[] | undefined): string {
  const configured = import.meta.env.VITE_OAUTH_SCOPES as string | undefined;
  if (configured) return configured;
  if (!offered?.includes('openid')) return '';
  return ['openid', 'email', 'profile', 'offline_access'].filter((s) => offered.includes(s)).join(' ');
}

/**
 * Sends the browser to the server's sign-in page. `username` prefills it;
 * `returnUrl` is where to land afterwards (the current page if left out).
 */
export async function startAuthFlow(username: string | null, returnUrl?: string | null): Promise<void> {
  const endpoints = await discover(username);
  const verifier = generateCodeVerifier();
  const { challenge, method } = await generateCodeChallenge(verifier);
  const state = newState();

  const pending: Record<Pending, string | undefined> = {
    code_verifier: verifier,
    token_endpoint: endpoints.token_endpoint,
    state,
    return_url: returnPath(returnUrl),
    end_session_endpoint: endpoints.end_session_endpoint,
  };
  for (const name of PENDING) {
    const value = pending[name];
    if (value === undefined)
      sessionStorage.removeItem(pendingKey(name)); // no end-session endpoint
    else sessionStorage.setItem(pendingKey(name), value);
  }

  const query = new URLSearchParams({
    response_type: 'code',
    client_id: getOAuthClientId(),
    redirect_uri: getOAuthRedirectUri(),
    code_challenge: challenge,
    code_challenge_method: method,
    state,
    // Always ask for the password: a console session should never start silently.
    prompt: 'login',
  });
  if (username) query.set('login_hint', username);
  const scope = scopesFor(endpoints.scopes_supported);
  if (scope) query.set('scope', scope);

  window.location.href = `${endpoints.authorization_endpoint}?${query}`;
}

/** Trades the code from the callback for tokens. */
export async function exchangeCode(
  code: string,
  codeVerifier: string,
  tokenEndpoint: string,
  redirectUri: string,
): Promise<TokenResponse> {
  const res = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: codeVerifier,
      client_id: getOAuthClientId(),
      redirect_uri: redirectUri,
    }),
  });
  if (!res.ok) {
    throw new Error(
      i18n.t('oauth.tokenExchangeFailed', 'Token exchange failed: {{status}} {{statusText}}', {
        status: res.status,
        statusText: res.statusText,
      }),
    );
  }
  return (await res.json()) as TokenResponse;
}

/** The server's end-session URL, sending the browser back to sign-in afterwards. */
export function buildEndSessionUrl(endSessionEndpoint: string, postLogoutRedirectUri: string): string {
  const query = new URLSearchParams({ client_id: getOAuthClientId(), post_logout_redirect_uri: postLogoutRedirectUri });
  return `${endSessionEndpoint}${endSessionEndpoint.includes('?') ? '&' : '?'}${query}`;
}
