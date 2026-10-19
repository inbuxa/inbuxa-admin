/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  exchangeCode: vi.fn(),
  setTokens: vi.fn(),
  basePath: '',
}));
vi.mock('@/lib/basePath', () => ({ getBasePath: () => mocks.basePath }));
vi.mock('@/stores/authStore', () => ({ useAuthStore: { getState: () => ({ setTokens: mocks.setTokens }) } }));
vi.mock('./oauth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./oauth')>()),
  exchangeCode: mocks.exchangeCode,
  getOAuthRedirectUri: () => 'https://admin.example.org/oauth/callback',
}));

import { finishSignIn, landingPath } from './callback';
import { getStoredOAuthData } from './oauth';

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

/** What startAuthFlow would have kept for this browser's sign-in. */
function keep(overrides: Record<string, string> = {}) {
  const kept: Record<string, string> = {
    code_verifier: 'verifier',
    token_endpoint: 'https://mail.example.org/auth/token',
    state: 'abc123',
    return_url: '/Settings/x:Domain',
    end_session_endpoint: 'https://mail.example.org/logout',
    ...overrides,
  };
  for (const [k, v] of Object.entries(kept)) sessionStorage.setItem(`inbuxa-oauth-${k}`, v);
}

const query = (q: string) => new URLSearchParams(q);
const nothingKept = () => Object.values(getStoredOAuthData()).every((v) => v === null);

beforeEach(() => {
  sessionStorage.clear();
  mocks.exchangeCode.mockReset().mockResolvedValue({ access_token: 'A', refresh_token: 'R', expires_in: 300 });
  mocks.setTokens.mockReset();
  mocks.basePath = '';
});

describe('finishSignIn', () => {
  it('trades the code, keeps the tokens and goes back where the admin was', async () => {
    keep();
    expect(await finishSignIn(query('code=c0de&state=abc123'))).toBe('/Settings/x:Domain');
    expect(mocks.exchangeCode).toHaveBeenCalledWith(
      'c0de',
      'verifier',
      'https://mail.example.org/auth/token',
      'https://admin.example.org/oauth/callback',
    );
    expect(mocks.setTokens).toHaveBeenCalledWith(
      'A',
      'R',
      300,
      'https://mail.example.org/auth/token',
      'https://mail.example.org/logout',
    );
    expect(nothingKept()).toBe(true);
  });

  it("refuses a callback this browser didn't start", async () => {
    keep();
    await expect(finishSignIn(query('code=c0de&state=forged'))).rejects.toThrow('State parameter mismatch');
    sessionStorage.clear();
    await expect(finishSignIn(query('code=c0de&state=abc123'))).rejects.toThrow('State parameter mismatch');
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it("shows the server's error, or says what is missing", async () => {
    keep();
    await expect(finishSignIn(query('error=access_denied&error_description=Wrong+password'))).rejects.toThrow(
      'Wrong password',
    );
    keep();
    await expect(finishSignIn(query('error=access_denied'))).rejects.toThrow('access_denied');
    keep();
    await expect(finishSignIn(query('state=abc123'))).rejects.toThrow('Missing authorization code');
    keep({ code_verifier: '' });
    await expect(finishSignIn(query('code=c&state=abc123'))).rejects.toThrow('Missing OAuth session data');
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
  });

  it('forgets the sign-in after a failed trade too', async () => {
    keep();
    mocks.exchangeCode.mockRejectedValue(new Error('Token exchange failed: 400 Bad Request'));
    await expect(finishSignIn(query('code=c&state=abc123'))).rejects.toThrow('400');
    expect(mocks.setTokens).not.toHaveBeenCalled();
    expect(nothingKept()).toBe(true);
  });
});

describe('landingPath', () => {
  it('drops the base path, and lands on the start page instead of a sign-in page', () => {
    expect(landingPath(null)).toBe('/');
    expect(landingPath('/Management/x:Account?q=1')).toBe('/Management/x:Account?q=1');
    expect(landingPath('/login')).toBe('/');
    expect(landingPath('/oauth/callback?code=1')).toBe('/');
    mocks.basePath = '/admin';
    expect(landingPath('/admin/Settings')).toBe('/Settings');
    expect(landingPath('/admin')).toBe('/');
    expect(landingPath('/admin/login?x')).toBe('/');
  });
});
