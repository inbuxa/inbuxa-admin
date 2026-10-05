/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Metric } from './types/metrics';
import {
  cleanShare,
  latest,
  load,
  nodeSeries,
  mean,
  nearQuota,
  queueHealth,
  series,
  summarize,
  total,
  zoneOf,
} from './commandCenter';

const at = (iso: string, metric: string, count: number): Metric => ({
  '@type': 'Counter',
  metric,
  count,
  timestamp: iso,
});
const timing = (metric: string, count: number, sum: number): Metric => ({
  '@type': 'Histogram',
  metric,
  count,
  sum,
  timestamp: '2026-09-28T10:00:00Z',
});

describe('total', () => {
  it('adds up only the metrics asked for', () => {
    const s = [
      at('2026-09-28T10:00:00Z', 'a', 3),
      at('2026-09-28T11:00:00Z', 'b', 4),
      at('2026-09-28T12:00:00Z', 'a', 1),
    ];
    expect(total(s, ['a'])).toBe(4);
    expect(total(s, ['a', 'b'])).toBe(8);
  });
});

describe('mean', () => {
  it('weights each sample by how many events it holds', () => {
    // 1 event at 100 ms and 3 at 300 ms: 250 ms, not the 200 of a plain average.
    expect(mean([timing('t', 1, 100), timing('t', 3, 900)], ['t'])).toBe(250);
  });
  it('is null when nothing was timed', () => {
    expect(mean([], ['t'])).toBeNull();
    expect(mean([at('2026-09-28T10:00:00Z', 't', 5)], ['t'])).toBeNull();
  });
});

describe('series', () => {
  it('drops each sample in its slice of the period', () => {
    const from = new Date('2026-09-28T00:00:00Z');
    const to = new Date('2026-09-28T04:00:00Z');
    const s = [
      at('2026-09-28T00:30:00Z', 'a', 2),
      at('2026-09-28T03:30:00Z', 'a', 5),
      at('2026-09-28T03:40:00Z', 'b', 9),
    ];
    expect(series(s, ['a'], from, to, 4)).toEqual([2, 0, 0, 5]);
  });
});

describe('load', () => {
  it('reads now from the last complete slice while the newest is still filling', () => {
    expect(load([10, 40, 20, 3])).toEqual({ now: 20, peak: 40, ratio: 0.5 });
  });
  it('takes the newest slice once it has overtaken the one before', () => {
    expect(load([10, 40, 20, 30]).now).toBe(30);
  });
  it('is zero without traffic', () => {
    expect(load([0, 0])).toEqual({ now: 0, peak: 0, ratio: 0 });
    expect(load([])).toEqual({ now: 0, peak: 0, ratio: 0 });
  });
});

describe('zoneOf', () => {
  const l = { good: 100, bad: 1000 };
  it('marks the bounds inclusive of the better zone', () => {
    expect(zoneOf(100, l)).toBe('good');
    expect(zoneOf(101, l)).toBe('fair');
    expect(zoneOf(1000, l)).toBe('fair');
    expect(zoneOf(1001, l)).toBe('slow');
  });
});

describe('queueHealth', () => {
  it('is the share of recipients simply waiting their turn', () => {
    expect(
      queueHealth([
        { scheduled: 6, retrying: 1, failed: 1 },
        { scheduled: 2, retrying: 0, failed: 0 },
      ]),
    ).toBe(0.8);
  });
  it('is whole when the queue is empty or unknown', () => {
    expect(queueHealth([])).toBe(1);
    expect(queueHealth(undefined)).toBe(1);
  });
});

describe('nearQuota', () => {
  it('counts accounts at 90% of a quota, ignoring those without one', () => {
    const s = [
      { used: 90, quota: 100 },
      { used: 89, quota: 100 },
      { used: 5000, quota: null },
      { used: 120, quota: 100 },
    ];
    expect(nearQuota(s)).toBe(2);
  });
});

describe('summarize', () => {
  const level = (iso: string, count: number): Metric => ({ '@type': 'Gauge', metric: 'q', count, timestamp: iso });
  it('reads a level by its latest value, not by adding readings up', () => {
    const s = [level('2026-09-28T10:00:00Z', 30), level('2026-09-28T12:00:00Z', 7), level('2026-09-28T11:00:00Z', 50)];
    expect(latest(s, ['q'])).toBe(7);
    expect(summarize(s, ['q'], false)).toBe(7);
  });
  it('totals counts and averages timings', () => {
    expect(summarize([at('2026-09-28T10:00:00Z', 'c', 2), at('2026-09-28T11:00:00Z', 'c', 3)], ['c'], false)).toBe(5);
    expect(summarize([timing('t', 2, 100)], ['t'], true)).toBe(50);
  });
});

describe('cleanShare', () => {
  it('is the share of slices without a single event', () => {
    expect(cleanShare([0, 0, 3, 0])).toBe(0.75);
    expect(cleanShare([])).toBe(1);
  });
});

describe('nodeSeries', () => {
  const from = new Date('2026-10-05T00:00:00Z');
  const to = new Date('2026-10-05T04:00:00Z');
  const count = (hour: number, n: number, nodeId?: number): Metric => ({
    '@type': 'Counter',
    metric: 'queue.message-queued',
    count: n,
    timestamp: `2026-10-05T0${hour}:30:00Z`,
    nodeId,
  });
  const samples = [count(0, 3, 1), count(0, 5, 2), count(2, 4, 1), count(3, 7, 2)];

  it('counts only what the node wrote, slice by slice', () => {
    expect(nodeSeries(samples, 1, ['queue.message-queued'], from, to, 4)).toEqual([3, 0, 4, 0]);
    expect(nodeSeries(samples, 2, ['queue.message-queued'], from, to, 4)).toEqual([5, 0, 0, 7]);
  });

  it('finds nothing in samples that don’t say which node wrote them', () => {
    expect(nodeSeries([count(0, 3), count(1, 2)], 1, ['queue.message-queued'], from, to, 4)).toEqual([0, 0, 0, 0]);
  });
});
