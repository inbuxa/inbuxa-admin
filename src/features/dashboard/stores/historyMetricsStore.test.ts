/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Metric, Period } from '../types/metrics';

const query = vi.fn();
vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'p',
  jmapQueryAllAndGet: (...args: unknown[]) => query(...args),
}));

const { useHistoryMetricsStore } = await import('./historyMetricsStore');
const store = () => useHistoryMetricsStore.getState();

const day: Period = { kind: 'preset', preset: '24h' };
const ids = new Set(['a', 'b']);
const sample = (count: number): Metric => ({ '@type': 'Counter', metric: 'a', count });

beforeEach(() => {
  vi.useFakeTimers({ now: new Date('2026-10-18T12:00:00Z') });
  query.mockReset();
  useHistoryMetricsStore.setState({ cache: new Map(), status: new Map(), error: new Map() });
});
afterEach(() => vi.useRealTimers());

describe('historyMetricsStore', () => {
  it('asks for every sample of the metrics in the window', async () => {
    query.mockResolvedValue({ ids: ['1'], list: [sample(1)] });
    expect(await store().fetch('mail', day, ids)).toEqual([sample(1)]);
    expect(query).toHaveBeenCalledWith('x:Metric', 'p', {
      filter: {
        timestampIsGreaterThanOrEqual: '2026-10-17T12:00:00.000Z',
        timestampIsLessThanOrEqual: '2026-10-18T12:00:00.000Z',
        metric: ['a', 'b'],
      },
    });
    expect(store().status.get('mail|24h')).toBe('idle');
  });

  it('asks for nothing when no metrics are wanted', async () => {
    expect(await store().fetch('mail', day, new Set())).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('reuses an answer for a minute, per dashboard and period', async () => {
    query.mockResolvedValue({ ids: [], list: [sample(1)] });
    await store().fetch('mail', day, ids);
    vi.advanceTimersByTime(59_999);
    await store().fetch('mail', day, ids);
    expect(query).toHaveBeenCalledTimes(1);
    await store().fetch('mail', { kind: 'preset', preset: '7d' }, ids);
    await store().fetch('other', day, ids);
    expect(query).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(1);
    await store().fetch('mail', day, ids);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('asks once while a fetch is on its way, answering the rest with what it has', async () => {
    let answer!: (v: unknown) => void;
    query.mockReturnValue(new Promise((r) => (answer = r)));
    const first = store().fetch('mail', day, ids);
    expect(await store().fetch('mail', day, ids)).toEqual([]);
    answer({ ids: [], list: [sample(2)] });
    expect(await first).toEqual([sample(2)]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('keeps the last numbers when a fetch fails, and says why', async () => {
    query.mockResolvedValueOnce({ ids: [], list: [sample(1)] }).mockRejectedValueOnce(new Error('offline'));
    await store().fetch('mail', day, ids);
    vi.advanceTimersByTime(60_000);
    expect(await store().fetch('mail', day, ids)).toEqual([sample(1)]);
    expect(store().status.get('mail|24h')).toBe('error');
    expect(store().error.get('mail|24h')).toBe('offline');

    query.mockResolvedValueOnce({ ids: [], list: [sample(3)] });
    vi.advanceTimersByTime(60_000);
    await store().fetch('mail', day, ids);
    expect(store().error.has('mail|24h')).toBe(false);
  });

  it('refreshes now, showing the old numbers until the new ones arrive', async () => {
    query.mockResolvedValueOnce({ ids: [], list: [sample(1)] });
    await store().fetch('mail', day, ids);
    let answer!: (v: unknown) => void;
    query.mockReturnValueOnce(new Promise((r) => (answer = r)));
    const refreshed = store().refresh('mail', day, ids);
    expect(store().cache.get('mail|24h')?.metrics).toEqual([sample(1)]);
    answer({ ids: [], list: [sample(5)] });
    expect(await refreshed).toEqual([sample(5)]);
  });

  it("forgets a dashboard's answers on invalidate", async () => {
    query.mockResolvedValue({ ids: [], list: [] });
    await store().fetch('mail', day, ids);
    await store().fetch('mailbox', day, ids);
    store().invalidate('mail');
    expect([...store().cache.keys()]).toEqual(['mailbox|24h']);
  });
});
