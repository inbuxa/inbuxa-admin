/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const jmapRequest = vi.fn();
vi.mock('@/services/jmap/client', () => ({
  fetchSession: vi.fn(),
  getAccountId: () => 'admin',
  jmapRequest: (...args: unknown[]) => jmapRequest(...args),
}));
vi.mock('@/services/api', () => ({ apiFetch: vi.fn() }));

const { exportFileName, fetchExports, startExport } = await import('./holdExport');

beforeEach(() => jmapRequest.mockReset());

describe('hold exports', () => {
  it('reads exports and settles unknown statuses as running', async () => {
    jmapRequest.mockResolvedValue([
      [
        'inbuxa:HoldExport/get',
        {
          list: [
            {
              id: 'e1',
              holdId: 'h',
              status: 'ready',
              blobId: 'b',
              size: 10,
              items: 2,
              sha256: 'ab',
              accountIds: ['x'],
            },
            { id: 'e2', holdId: 'h', status: 'queued' },
          ],
        },
      ],
    ]);
    const list = await fetchExports();
    expect(list[0]).toMatchObject({ id: 'e1', status: 'ready', blobId: 'b', items: 2, accountIds: ['x'] });
    expect(list[1]).toMatchObject({ status: 'running', blobId: null, accountIds: [], size: 0 });
  });

  it('sends only the accounts asked for, and the reason trimmed', async () => {
    jmapRequest.mockResolvedValue([['inbuxa:HoldExport/set', { created: { x: { id: 'e3' } } }]]);
    expect(await startExport('h', [], '  production request ')).toBe('e3');
    const [[, args]] = jmapRequest.mock.calls[0][0];
    expect(args).toEqual({ accountId: 'admin', create: { x: { holdId: 'h', reason: 'production request' } } });

    await startExport('h', ['a', 'b'], 'r');
    expect(jmapRequest.mock.calls[1][0][0][1].create.x.accountIds).toEqual(['a', 'b']);
  });

  it('passes the server’s refusal on', async () => {
    jmapRequest.mockResolvedValue([
      ['inbuxa:HoldExport/set', { notCreated: { x: { type: 'invalidProperties', description: 'Say why.' } } }],
    ]);
    await expect(startExport('h', [], 'r')).rejects.toThrow('Say why.');
    jmapRequest.mockResolvedValue([['error', { type: 'forbidden' }]]);
    await expect(fetchExports()).rejects.toThrow('forbidden');
  });

  it('names the file after the case and the day', () => {
    const exp = { id: 'e1', createdAt: '2026-09-28T10:00:00Z' } as Parameters<typeof exportFileName>[1];
    expect(exportFileName('Matter 4411 / Acme', exp)).toBe('Matter-4411-Acme-2026-09-28-e1.zip');
    expect(exportFileName('///', exp)).toBe('hold-2026-09-28-e1.zip');
  });
});
