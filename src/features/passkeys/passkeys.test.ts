/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const jmapRequest = vi.fn();
vi.mock('@/services/jmap/client', () => ({ jmapRequest: (...args: unknown[]) => jmapRequest(...args) }));

import {
  createPasskey,
  passkeyPolicy,
  fetchPasskeys,
  fromServer,
  nameProblem,
  PasskeyRefused,
  PasskeysUnavailable,
  removePasskeys,
  renamePasskey,
  sortPasskeys,
} from './passkeys';

beforeEach(() => jmapRequest.mockReset());

describe('fromServer', () => {
  it('reads a record, and treats missing flags as false', () => {
    expect(
      fromServer({ id: 'p1', name: 'Phone', state: 'active', usable: true, createdAt: '2026-11-18T10:00:00Z' }),
    ).toEqual({
      id: 'p1',
      name: 'Phone',
      state: 'active',
      usable: true,
      backedUp: false,
      createdAt: '2026-11-18T10:00:00Z',
      lastUsedAt: '',
    });
    expect(fromServer({ id: 'p2', state: 'pending', lastUsedAt: null }).state).toBe('pending');
  });
});

describe('sortPasskeys', () => {
  it('lists active ones newest first, pending last', () => {
    const list = [
      fromServer({ id: 'pending', state: 'pending' }),
      fromServer({ id: 'old', state: 'active', createdAt: '2026-01-01T00:00:00Z' }),
      fromServer({ id: 'new', state: 'active', createdAt: '2026-11-01T00:00:00Z' }),
    ];
    expect(sortPasskeys(list).map((p) => p.id)).toEqual(['new', 'old', 'pending']);
  });
});

describe('nameProblem', () => {
  it('needs a name of at most 64 characters', () => {
    expect(nameProblem('  ')).toBe('empty');
    expect(nameProblem('x'.repeat(65))).toBe('tooLong');
    expect(nameProblem(' YubiKey ')).toBeNull();
  });
});

describe('requests', () => {
  it('lists an account’s passkeys with its own accountId', async () => {
    jmapRequest.mockResolvedValue([
      ['inbuxa:Passkey/get', { list: [{ id: 'p1', name: 'Phone', state: 'active' }] }, '0'],
    ]);
    const list = await fetchPasskeys('acc');
    expect(list.map((p) => p.name)).toEqual(['Phone']);
    expect(jmapRequest.mock.calls[0][0]).toEqual([['inbuxa:Passkey/get', { accountId: 'acc', ids: null }, '0']]);
    expect(jmapRequest.mock.calls[0][2]).toEqual(['urn:inbuxa:jmap']);
  });

  it('says passkeys are unavailable on an older server or an account out of reach', async () => {
    jmapRequest.mockResolvedValue([['error', { type: 'unknownMethod' }, '0']]);
    await expect(fetchPasskeys('acc')).rejects.toBeInstanceOf(PasskeysUnavailable);
    jmapRequest.mockResolvedValue([['error', { type: 'forbidden' }, '0']]);
    await expect(fetchPasskeys('acc')).rejects.toBeInstanceOf(PasskeysUnavailable);
  });

  it('returns the registration page of a new passkey', async () => {
    jmapRequest.mockResolvedValue([
      [
        'inbuxa:Passkey/set',
        { created: { p: { id: 'p9', registrationUrl: 'https://mail.example/passkey/register?t=x' } } },
        '0',
      ],
    ]);
    await expect(createPasskey('acc', ' Phone ')).resolves.toBe('https://mail.example/passkey/register?t=x');
    expect(jmapRequest.mock.calls[0][0][0][1]).toEqual({
      accountId: 'acc',
      create: { p: { accountId: 'acc', name: 'Phone' } },
    });
  });

  it('tells passkeys turned off apart from a full account', async () => {
    for (const type of ['forbidden', 'overQuota'] as const) {
      jmapRequest.mockResolvedValue([['inbuxa:Passkey/set', { notCreated: { p: { type } } }, '0']]);
      const error = await createPasskey('acc', 'Phone').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(PasskeyRefused);
      expect((error as PasskeyRefused).kind).toBe(type);
    }
  });

  it('renames and removes, and reports a refusal', async () => {
    jmapRequest.mockResolvedValue([['inbuxa:Passkey/set', { updated: { p1: null } }, '0']]);
    await renamePasskey('acc', 'p1', 'Laptop');
    expect(jmapRequest.mock.calls[0][0][0][1]).toEqual({ accountId: 'acc', update: { p1: { name: 'Laptop' } } });

    jmapRequest.mockResolvedValue([['inbuxa:Passkey/set', { destroyed: ['p1', 'p2'] }, '0']]);
    await removePasskeys('acc', ['p1', 'p2']);
    expect(jmapRequest.mock.calls[1][0][0][1]).toEqual({ accountId: 'acc', destroy: ['p1', 'p2'] });

    jmapRequest.mockResolvedValue([
      ['inbuxa:Passkey/set', { notDestroyed: { p1: { type: 'forbidden', description: 'No.' } } }, '0'],
    ]);
    await expect(removePasskeys('acc', ['p1'])).rejects.toThrow('No.');
  });

  it('sends nothing when there is nothing to remove', async () => {
    await removePasskeys('acc', []);
    expect(jmapRequest).not.toHaveBeenCalled();
  });

  it('reads up front whether adding is allowed (PK-19)', () => {
    const session = (cap: Record<string, unknown>) => ({ accounts: { a: { accountCapabilities: { 'urn:inbuxa:jmap': cap } } } });
    expect(passkeyPolicy(session({ passkeysAllowed: false, maxPasskeys: 10 }), 'a')).toEqual({ allowed: false, max: 10 });
    expect(passkeyPolicy(session({ passkeysAllowed: true, maxPasskeys: 3 }), 'a')).toEqual({ allowed: true, max: 3 });
    // an older server says nothing: the add stays and the server refuses it
    expect(passkeyPolicy(session({ aiExplain: false }), 'a')).toEqual({ allowed: undefined, max: undefined });
    expect(passkeyPolicy(null, 'a')).toEqual({});
  });
});
