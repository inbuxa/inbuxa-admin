/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JmapMethodCall, JmapMethodResponse } from '@/types/jmap';

const mocks = vi.hoisted(() => ({
  jmapRequest: vi.fn<(calls: JmapMethodCall[]) => Promise<JmapMethodResponse[]>>(),
}));

vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'admin',
  jmapRequest: mocks.jmapRequest,
}));

import {
  DeletedAccountsUnavailable,
  destroyDeletedAccount,
  fetchDeletedAccounts,
  fromServer,
  restoreDeletedAccount,
} from './deletedAccount';

const sent = () => mocks.jmapRequest.mock.calls[0]![0][0]!;

beforeEach(() => mocks.jmapRequest.mockReset());

describe('fromServer', () => {
  it('reads what the server sends', () => {
    expect(
      fromServer({
        id: 'b',
        name: 'gone',
        addresses: ['gone@example.org'],
        memberTenantId: null,
        deletedAt: '2026-11-07T10:00:00Z',
        keptUntil: '2026-12-07T10:00:00Z',
      }),
    ).toEqual({
      id: 'b',
      name: 'gone',
      addresses: ['gone@example.org'],
      memberTenantId: null,
      deletedAt: '2026-11-07T10:00:00Z',
      keptUntil: '2026-12-07T10:00:00Z',
    });
  });

  it('copes with missing fields', () => {
    expect(fromServer({ id: 'c' })).toMatchObject({ name: '', addresses: [], memberTenantId: null });
  });
});

describe('fetchDeletedAccounts', () => {
  it('lists them all, soonest to go first', async () => {
    mocks.jmapRequest.mockResolvedValue([
      [
        'inbuxa:DeletedAccount/get',
        {
          list: [
            { id: 'late', name: 'b', keptUntil: '2026-12-31T00:00:00Z' },
            { id: 'soon', name: 'a', keptUntil: '2026-11-30T00:00:00Z' },
          ],
        },
        '0',
      ],
    ]);
    const kept = await fetchDeletedAccounts();
    expect(kept.map((k) => k.id)).toEqual(['soon', 'late']);
    expect(sent()).toEqual(['inbuxa:DeletedAccount/get', { accountId: 'admin', ids: null }, '0']);
  });

  it('says so when the server has no such method', async () => {
    mocks.jmapRequest.mockResolvedValue([['error', { type: 'unknownMethod' }, '0']]);
    await expect(fetchDeletedAccounts()).rejects.toBeInstanceOf(DeletedAccountsUnavailable);
  });
});

describe('restoreDeletedAccount', () => {
  it('sends the new password', async () => {
    mocks.jmapRequest.mockResolvedValue([['inbuxa:DeletedAccount/set', { updated: { b: null } }, '0']]);
    await restoreDeletedAccount('b', 'a new passphrase');
    expect(sent()[1]).toEqual({ accountId: 'admin', update: { b: { restore: true, password: 'a new passphrase' } } });
  });

  it('sends none for a group', async () => {
    mocks.jmapRequest.mockResolvedValue([['inbuxa:DeletedAccount/set', { updated: { g: null } }, '0']]);
    await restoreDeletedAccount('g', '');
    expect(sent()[1]).toEqual({ accountId: 'admin', update: { g: { restore: true } } });
  });

  it('passes on why the server refused', async () => {
    mocks.jmapRequest.mockResolvedValue([
      [
        'inbuxa:DeletedAccount/set',
        { notUpdated: { b: { type: 'invalidProperties', description: 'A restored account needs a new password.' } } },
        '0',
      ],
    ]);
    await expect(restoreDeletedAccount('b', '')).rejects.toThrow('needs a new password');
  });
});

describe('destroyDeletedAccount', () => {
  it('destroys it', async () => {
    mocks.jmapRequest.mockResolvedValue([['inbuxa:DeletedAccount/set', { destroyed: ['b'] }, '0']]);
    await destroyDeletedAccount('b');
    expect(sent()[1]).toEqual({ accountId: 'admin', destroy: ['b'] });
  });

  it('passes on a legal hold refusal', async () => {
    mocks.jmapRequest.mockResolvedValue([
      [
        'inbuxa:DeletedAccount/set',
        { notDestroyed: { b: { type: 'forbidden', description: 'Under a legal hold.' } } },
        '0',
      ],
    ]);
    await expect(destroyDeletedAccount('b')).rejects.toThrow('legal hold');
  });
});
