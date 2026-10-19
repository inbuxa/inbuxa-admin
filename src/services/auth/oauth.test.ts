/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildEndSessionUrl,
  clearStoredOAuthData,
  discover,
  exchangeCode,
  generateCodeChallenge,
  generateCodeVerifier,
  getStoredOAuthData,
  startAuthFlow,
} from './oauth';

const SERVER = 'https://mail.example.org';
const CONSOLE = 'https://admin.example.org';

// In memory: Node's own `sessionStorage` global, empty without a storage file, hides happy-dom's.
beforeAll(() => {
  const store = new Map<string, string>();
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  });
});

beforeEach(() => {
  document.head.innerHTML = `<meta name="api-base-url" content="${SERVER}" />`;
  sessionStorage.clear();
});

/** Answers fetches from a table of URL → JSON (or a status), recording what was asked. */
function serve(routes: Record<string, unknown>) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const answer = routes[url];
    if (answer === undefined) return new Response('', { status: 404, statusText: 'Not Found' });
    if (typeof answer === 'number') return new Response('', { status: answer, statusText: 'Nope' });
    return new Response(JSON.stringify(answer), { status: 200 });
  });
  return calls;
}

/** Stands in for window.location, capturing where the browser is sent. */
function pretendLocation(pathname = '/Settings/x:Domain', search = '') {
  const original = window.location;
  const sentTo = { href: '' };
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      origin: CONSOLE,
      pathname,
      search,
      get href() {
        return sentTo.href;
      },
      set href(v: string) {
        sentTo.href = v;
      },
    },
  });
  return { sentTo, restore: () => Object.defineProperty(window, 'location', { configurable: true, value: original }) };
}

afterEach(() => vi.unstubAllGlobals());

describe('code verifier', () => {
  it('is 64 characters by default, or the length asked for within 43–128', () => {
    expect(generateCodeVerifier()).toHaveLength(64);
    expect(generateCodeVerifier(43)).toHaveLength(43);
    expect(generateCodeVerifier(128)).toHaveLength(128);
    for (const bad of [42, 129, 50.5]) expect(() => generateCodeVerifier(bad)).toThrow(/43-128/);
  });

  it('uses only unreserved characters, all of them over enough samples, never repeating', () => {
    const samples = Array.from({ length: 200 }, () => generateCodeVerifier(128));
    for (const v of samples) expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/);
    expect(new Set(samples).size).toBe(samples.length);
    expect(new Set(samples.join('')).size).toBe(66);
  });
});

describe('code challenge', () => {
  it("matches RFC 7636's worked example", async () => {
    expect(await generateCodeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toEqual({
      challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
      method: 'S256',
    });
  });

  it('is the same S256 challenge where crypto.subtle is missing (plain HTTP)', async () => {
    const verifier = generateCodeVerifier();
    const expected = await generateCodeChallenge(verifier);
    const subtle = crypto.subtle;
    Object.defineProperty(crypto, 'subtle', { configurable: true, get: () => undefined });
    try {
      expect(await generateCodeChallenge(verifier)).toEqual(expected);
    } finally {
      Object.defineProperty(crypto, 'subtle', { configurable: true, value: subtle });
    }
  });
});

describe('discover', () => {
  it("reads the server's OpenID configuration, putting relative endpoints on the server", async () => {
    const calls = serve({
      [`${SERVER}/.well-known/openid-configuration`]: {
        authorization_endpoint: '/login',
        token_endpoint: `${SERVER}/auth/token`,
        end_session_endpoint: '/logout',
      },
    });
    expect(await discover()).toMatchObject({
      authorization_endpoint: `${SERVER}/login`,
      token_endpoint: `${SERVER}/auth/token`,
      end_session_endpoint: `${SERVER}/logout`,
    });
    expect(calls.map((c) => c.url)).toEqual([`${SERVER}/.well-known/openid-configuration`]);
  });

  it('asks per account when given a name, and says what failed', async () => {
    const calls = serve({ [`${SERVER}/api/discover/ann%40example.org`]: 503 });
    await expect(discover('ann@example.org')).rejects.toThrow('Discovery failed for "ann@example.org": 503 Nope');
    expect(calls[0].url).toBe(`${SERVER}/api/discover/ann%40example.org`);
  });
});

describe('startAuthFlow', () => {
  const config = {
    authorization_endpoint: '/login',
    token_endpoint: '/auth/token',
    end_session_endpoint: '/logout',
    scopes_supported: ['openid', 'profile', 'offline_access', 'urn:ietf:params:jmap:core'],
  };

  async function signIn(username: string | null, returnUrl?: string | null, path?: string) {
    serve({
      [`${SERVER}/.well-known/openid-configuration`]: config,
      [`${SERVER}/api/discover/${encodeURIComponent(username ?? '')}`]: config,
    });
    const loc = pretendLocation(path);
    try {
      await startAuthFlow(username, returnUrl);
    } finally {
      loc.restore();
    }
    return new URL(loc.sentTo.href);
  }

  it("sends the browser to the server's sign-in page with a PKCE challenge it can check", async () => {
    const to = await signIn(null);
    const stored = getStoredOAuthData();
    expect(`${to.origin}${to.pathname}`).toBe(`${SERVER}/login`);
    expect(Object.fromEntries(to.searchParams)).toEqual({
      response_type: 'code',
      client_id: 'inbuxa-admin',
      redirect_uri: `${CONSOLE}/oauth/callback`,
      code_challenge: (await generateCodeChallenge(stored.codeVerifier!)).challenge,
      code_challenge_method: 'S256',
      state: stored.state,
      prompt: 'login',
      scope: 'openid profile offline_access',
    });
    expect(stored.state).toMatch(/^[0-9a-f]{32}$/);
    expect(stored).toMatchObject({
      tokenEndpoint: `${SERVER}/auth/token`,
      endSessionEndpoint: `${SERVER}/logout`,
      returnUrl: '/Settings/x:Domain',
    });
  });

  it('prefills the account when given one', async () => {
    expect((await signIn('ann@example.org')).searchParams.get('login_hint')).toBe('ann@example.org');
  });

  it('comes back to the page asked for, but never to the sign-in pages', async () => {
    await signIn(null, '/Management/x:Account?q=ann');
    expect(getStoredOAuthData().returnUrl).toBe('/Management/x:Account?q=ann');
    await signIn(null, null, '/login');
    expect(getStoredOAuthData().returnUrl).toBe('');
    await signIn(null, '/oauth/callback?code=x');
    expect(getStoredOAuthData().returnUrl).toBe('');
  });

  it('forgets an end-session endpoint the server no longer offers', async () => {
    await signIn(null);
    config.end_session_endpoint = '';
    try {
      await signIn(null);
    } finally {
      config.end_session_endpoint = '/logout';
    }
    expect(getStoredOAuthData().endSessionEndpoint).toBeNull();
  });

  it('clears what it kept', async () => {
    await signIn(null);
    clearStoredOAuthData();
    expect(Object.values(getStoredOAuthData()).every((v) => v === null)).toBe(true);
  });
});

describe('exchangeCode', () => {
  it('posts the code, verifier and redirect URI, and returns the tokens', async () => {
    const tokens = { access_token: 'a', refresh_token: 'r', expires_in: 3600, token_type: 'Bearer' };
    const calls = serve({ [`${SERVER}/auth/token`]: tokens });
    expect(await exchangeCode('c0de', 'v3rifier', `${SERVER}/auth/token`, `${CONSOLE}/oauth/callback`)).toEqual(tokens);
    expect(calls[0].init?.method).toBe('POST');
    expect(Object.fromEntries(new URLSearchParams(String(calls[0].init?.body)))).toEqual({
      grant_type: 'authorization_code',
      code: 'c0de',
      code_verifier: 'v3rifier',
      client_id: 'inbuxa-admin',
      redirect_uri: `${CONSOLE}/oauth/callback`,
    });
  });

  it('says why a refused trade failed', async () => {
    serve({ [`${SERVER}/auth/token`]: 400 });
    await expect(exchangeCode('c', 'v', `${SERVER}/auth/token`, 'x')).rejects.toThrow(
      'Token exchange failed: 400 Nope',
    );
  });
});

describe('buildEndSessionUrl', () => {
  it('adds the client and where to come back to, after any query already there', () => {
    expect(buildEndSessionUrl(`${SERVER}/logout`, `${CONSOLE}/login`)).toBe(
      `${SERVER}/logout?client_id=inbuxa-admin&post_logout_redirect_uri=${encodeURIComponent(`${CONSOLE}/login`)}`,
    );
    expect(buildEndSessionUrl(`${SERVER}/logout?x=1`, 'y')).toMatch(/\/logout\?x=1&client_id=/);
  });
});
