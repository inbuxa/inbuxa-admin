/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const { useAuthStore } = await import('./authStore');
const { useCacheStore } = await import('./cacheStore');

const accounts = { p: { name: 'admin', isPersonal: true }, b: { name: 'shared', isPersonal: false } };
const auth = () => useAuthStore.getState();

beforeEach(() => {
  auth().logout();
  useAuthStore.setState({ maxObjectsInGet: 500, maxObjectsInSet: 500 });
  useCacheStore.getState().clearAll();
  memory.clear();
});

afterEach(() => vi.useRealTimers());

describe('tokens', () => {
  it('keeps the tokens and works out when they expire', () => {
    vi.useFakeTimers({ now: 1_000_000 });
    auth().setTokens('acc', 'ref', 3600, '/token', '/logout');
    expect(auth()).toMatchObject({
      accessToken: 'acc',
      refreshToken: 'ref',
      tokenExpiresAt: 1_000_000 + 3_600_000,
      tokenEndpoint: '/token',
      endSessionEndpoint: '/logout',
    });
  });

  it('has no sign-out endpoint unless given one', () => {
    auth().setTokens('acc', 'ref', 60, '/token', '/logout');
    auth().setTokens('acc', 'ref', 60, '/token');
    expect(auth().endSessionEndpoint).toBeNull();
  });

  it('is signed in only with a token that has not expired', () => {
    vi.useFakeTimers({ now: 0 });
    expect(auth().isAuthenticated()).toBe(false);
    auth().setTokens('acc', 'ref', 10, '/token');
    expect(auth().isAuthenticated()).toBe(true);
    vi.setSystemTime(10_000);
    expect(auth().isAuthenticated()).toBe(false);
  });

  it('counts a token as expiring inside its last minute', () => {
    vi.useFakeTimers({ now: 0 });
    expect(auth().isTokenExpiringSoon()).toBe(false);
    auth().setTokens('acc', 'ref', 120, '/token');
    vi.setSystemTime(60_000);
    expect(auth().isTokenExpiringSoon()).toBe(false);
    vi.setSystemTime(60_001);
    expect(auth().isTokenExpiringSoon()).toBe(true);
  });
});

describe('session', () => {
  it('starts on the primary account', () => {
    auth().setSession(accounts, 'p', '/jmap');
    expect(auth()).toMatchObject({ accounts, primaryAccountId: 'p', activeAccountId: 'p', apiUrl: '/jmap' });
  });

  it('stays on the account being looked at while it still exists', () => {
    auth().setSession(accounts, 'p', '/jmap');
    auth().switchAccount('b');
    auth().setSession(accounts, 'p', '/jmap');
    expect(auth().activeAccountId).toBe('b');
    auth().setSession({ p: accounts.p }, 'p', '/jmap');
    expect(auth().activeAccountId).toBe('p');
  });

  it('takes the object limits only when the server gives them', () => {
    auth().setSession(accounts, 'p', '/jmap', 50, 20);
    expect(auth()).toMatchObject({ maxObjectsInGet: 50, maxObjectsInSet: 20 });
    auth().setSession(accounts, 'p', '/jmap');
    expect(auth()).toMatchObject({ maxObjectsInGet: 50, maxObjectsInSet: 20 });
  });

  it('empties the cache when switching to another known account', () => {
    auth().setSession(accounts, 'p', '/jmap');
    const cache = useCacheStore.getState();
    cache.setDisplayNames('Mailbox', { m1: 'Inbox' });
    cache.setObjectList('Mailbox', [{ id: 'm1', label: 'Inbox' }]);
    auth().switchAccount('b');
    expect(auth().activeAccountId).toBe('b');
    expect(useCacheStore.getState()).toMatchObject({ displayNames: {}, objectLists: {} });
  });

  it('ignores a switch to an unknown or the same account', () => {
    auth().setSession(accounts, 'p', '/jmap');
    useCacheStore.getState().setDisplayNames('Mailbox', { m1: 'Inbox' });
    auth().switchAccount('p');
    auth().switchAccount('nope');
    expect(auth().activeAccountId).toBe('p');
    expect(useCacheStore.getState().getDisplayName('Mailbox', 'm1')).toBe('Inbox');
  });

  it('keeps who is signed in', () => {
    auth().setUsername('admin');
    expect(auth().username).toBe('admin');
  });
});

describe('logout', () => {
  it('forgets the tokens, the session and the user', () => {
    auth().setTokens('acc', 'ref', 60, '/token', '/logout');
    auth().setSession(accounts, 'p', '/jmap', 50);
    auth().setUsername('admin');
    auth().logout();
    expect(auth()).toMatchObject({
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      tokenEndpoint: null,
      endSessionEndpoint: null,
      accounts: {},
      primaryAccountId: null,
      activeAccountId: null,
      apiUrl: null,
      username: null,
    });
  });
});

describe('persistence', () => {
  it('keeps the tokens and the active account in session storage, and nothing else', () => {
    auth().setTokens('acc', 'ref', 60, '/token', '/logout');
    auth().setSession(accounts, 'p', '/jmap');
    auth().setUsername('admin');
    const saved = JSON.parse(memory.get('inbuxa-auth')!);
    expect(Object.keys(saved.state).sort()).toEqual(
      [
        'accessToken',
        'activeAccountId',
        'endSessionEndpoint',
        'refreshToken',
        'tokenEndpoint',
        'tokenExpiresAt',
      ].sort(),
    );
    expect(saved.state).toMatchObject({ accessToken: 'acc', activeAccountId: 'p', endSessionEndpoint: '/logout' });
  });

  it('reads them back', async () => {
    memory.set(
      'inbuxa-auth',
      JSON.stringify({ state: { accessToken: 'saved', refreshToken: 'r', activeAccountId: 'b' }, version: 0 }),
    );
    await useAuthStore.persist.rehydrate();
    expect(auth()).toMatchObject({ accessToken: 'saved', refreshToken: 'r', activeAccountId: 'b' });
  });
});
