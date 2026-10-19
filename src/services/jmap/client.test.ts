/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@/services/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const memory = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const { useAuthStore } = await import('@/stores/authStore');
const client = await import('./client');

/** Answers each request in turn with these method responses. */
function answer(...pages: unknown[][]) {
  for (const methodResponses of pages) {
    apiFetch.mockResolvedValueOnce({ json: async () => ({ methodResponses, sessionState: 's' }) });
  }
}

/** The JSON body of the nth request. */
const body = (n = 0) => JSON.parse(apiFetch.mock.calls[n][1].body as string);

beforeEach(() => {
  apiFetch.mockReset();
  client.setRegistryWriteListener(null);
  useAuthStore.setState({
    primaryAccountId: 'p',
    activeAccountId: 'a',
    apiUrl: null,
    maxObjectsInGet: 500,
  });
});

describe('getAccountId', () => {
  it('puts registry types on the primary account and the rest on the active one', () => {
    expect(client.getAccountId('x:Domain')).toBe('p');
    expect(client.getAccountId('Mailbox')).toBe('a');
  });

  it('says which account is missing', () => {
    useAuthStore.setState({ primaryAccountId: null, activeAccountId: null });
    expect(() => client.getAccountId('x:Domain')).toThrow('No primary account ID available');
    expect(() => client.getAccountId('Mailbox')).toThrow('No active account ID available');
  });
});

describe('jmapRequest', () => {
  it('posts the calls with the core capabilities and any extra ones', async () => {
    answer([['Mailbox/get', { list: [] }, '0']]);
    const calls: [string, Record<string, unknown>, string][] = [['Mailbox/get', { accountId: 'a' }, '0']];
    const responses = await client.jmapRequest(calls, undefined, ['urn:example']);
    expect(responses).toEqual([['Mailbox/get', { list: [] }, '0']]);
    const [path, init] = apiFetch.mock.calls[0];
    expect(path).toBe('/jmap');
    expect(init.method).toBe('POST');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(body().methodCalls).toEqual(calls);
    expect(body().using).toContain('urn:ietf:params:jmap:core');
    expect(body().using).toContain('urn:inbuxa:jmap:registry');
    expect(body().using.at(-1)).toBe('urn:example');
  });

  it.each([
    ['https://mail.example/api/jmap/', '/api/jmap/'],
    ['/custom/jmap', '/custom/jmap'],
    ['https://[broken', '/jmap'],
  ])('sends to the path of apiUrl %s', async (apiUrl, path) => {
    useAuthStore.setState({ apiUrl });
    answer([]);
    await client.jmapRequest([]);
    expect(apiFetch.mock.calls[0][0]).toBe(path);
  });

  it('passes the abort signal through', async () => {
    const signal = new AbortController().signal;
    answer([]);
    await client.jmapRequest([], signal);
    expect(apiFetch.mock.calls[0][1].signal).toBe(signal);
  });

  it('tells the listener about registry writes, with what they changed', async () => {
    const listener = { started: vi.fn(), finished: vi.fn() };
    client.setRegistryWriteListener(listener);
    answer([['x:Domain/set', { updated: { d1: null } }, '0']]);
    await client.jmapSet('x:Domain', 'p', { update: { d1: { name: 'x' } } });
    expect(listener.started).toHaveBeenCalledTimes(1);
    expect(listener.finished).toHaveBeenCalledWith([expect.objectContaining({ objectName: 'x:Domain' })]);
  });

  it('still finishes the listener when the request fails', async () => {
    const listener = { started: vi.fn(), finished: vi.fn() };
    client.setRegistryWriteListener(listener);
    apiFetch.mockRejectedValueOnce(new Error('offline'));
    await expect(client.jmapSet('x:Domain', 'p', { destroy: ['d1'] })).rejects.toThrow('offline');
    expect(listener.finished).toHaveBeenCalledWith([]);
  });

  it('leaves the listener out of reads', async () => {
    const listener = { started: vi.fn(), finished: vi.fn() };
    client.setRegistryWriteListener(listener);
    answer([['x:Domain/get', { list: [] }, '0']]);
    await client.jmapGet('x:Domain', 'p', null);
    expect(listener.started).not.toHaveBeenCalled();
  });
});

describe('shaped calls', () => {
  it('gets some or all objects, with properties only when asked', async () => {
    answer([], []);
    await client.jmapGet('Mailbox', 'a', null);
    await client.jmapGet('Mailbox', 'a', ['m1'], ['name']);
    expect(body(0).methodCalls).toEqual([['Mailbox/get', { accountId: 'a', ids: null }, '0']]);
    expect(body(1).methodCalls).toEqual([['Mailbox/get', { accountId: 'a', ids: ['m1'], properties: ['name'] }, '0']]);
  });

  it('sets with create, update and destroy in one call', async () => {
    answer([]);
    await client.jmapSet('x:Domain', 'p', { create: { n: { name: 'a' } }, destroy: ['d2'] });
    expect(body().methodCalls).toEqual([
      ['x:Domain/set', { accountId: 'p', create: { n: { name: 'a' } }, destroy: ['d2'] }, '0'],
    ]);
  });

  it('queries and gets the found ids by back-reference', async () => {
    answer([]);
    await client.jmapQueryAndGet('x:Account', 'p', { limit: 10 }, ['name']);
    expect(body().methodCalls).toEqual([
      ['x:Account/query', { accountId: 'p', limit: 10 }, '0'],
      [
        'x:Account/get',
        { accountId: 'p', '#ids': { resultOf: '0', name: 'x:Account/query', path: '/ids' }, properties: ['name'] },
        '1',
      ],
    ]);
  });
});

describe('jmapGetBatched', () => {
  it('splits the ids by maxObjectsInGet and joins the lists', async () => {
    useAuthStore.setState({ maxObjectsInGet: 2 });
    answer([['T/get', { list: [{ id: '1' }, { id: '2' }] }, '0']], [['T/get', { list: [{ id: '3' }] }, '0']]);
    const list = await client.jmapGetBatched('T', 'a', ['1', '2', '3']);
    expect(list.map((o) => o.id)).toEqual(['1', '2', '3']);
    expect(body(0).methodCalls[0][1].ids).toEqual(['1', '2']);
    expect(body(1).methodCalls[0][1].ids).toEqual(['3']);
  });

  it('sends nothing for no ids', async () => {
    expect(await client.jmapGetBatched('T', 'a', [])).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('throws with the error type', async () => {
    answer([['error', { type: 'forbidden' }, '0']]);
    await expect(client.jmapGetBatched('T', 'a', ['1'])).rejects.toThrow('JMAP T/get error: forbidden');
  });

  it('stops once aborted', async () => {
    const abort = new AbortController();
    abort.abort();
    expect(await client.jmapGetBatched('T', 'a', ['1'], undefined, abort.signal)).toEqual([]);
    expect(apiFetch).not.toHaveBeenCalled();
  });
});

describe('jmapQueryAll', () => {
  it('pages on from the last id until an empty page', async () => {
    answer(
      [['T/query', { ids: ['1', '2'], limit: 2 }, '0']],
      [['T/query', { ids: ['3'], limit: 2 }, '0']],
      [['T/query', { ids: [], limit: 2 }, '0']],
    );
    const ids = await client.jmapQueryAll('T', 'a', { position: 0, limit: 2 });
    expect(ids).toEqual(['1', '2', '3']);
    expect(body(0).methodCalls[0][1]).toEqual({ accountId: 'a', position: 0, limit: 2 });
    expect(body(1).methodCalls[0][1]).toEqual({ accountId: 'a', limit: 2, anchor: '2', anchorOffset: 1 });
    expect(body(2).methodCalls[0][1].anchor).toBe('3');
  });

  it('stops when the server sets no limit', async () => {
    answer([['T/query', { ids: ['1'] }, '0']]);
    expect(await client.jmapQueryAll('T', 'a')).toEqual(['1']);
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it('throws with the error type', async () => {
    answer([['error', {}, '0']]);
    await expect(client.jmapQueryAll('T', 'a')).rejects.toThrow('JMAP T/query error: unknown');
  });

  it('gets everything a query matches, skipping the get when nothing does', async () => {
    answer([['T/query', { ids: ['1'] }, '0']], [['T/get', { list: [{ id: '1' }] }, '0']]);
    expect(await client.jmapQueryAllAndGet('T', 'a')).toEqual({ ids: ['1'], list: [{ id: '1' }] });
    apiFetch.mockReset();
    answer([['T/query', { ids: [] }, '0']]);
    expect(await client.jmapQueryAllAndGet('T', 'a')).toEqual({ ids: [], list: [] });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });
});

describe('server info', () => {
  it.each([
    ['fetchSession', '/jmap/session'],
    ['fetchSchema', '/api/schema'],
    ['fetchAccountInfo', '/api/account'],
  ] as const)('%s reads %s', async (name, path) => {
    apiFetch.mockResolvedValueOnce({ json: async () => ({ ok: true }) });
    expect(await client[name]()).toEqual({ ok: true });
    expect(apiFetch).toHaveBeenCalledWith(path);
  });
});
