/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Metric } from './types/metrics';
import { deltaHistograms, gaugeReading, seriesBucketValue } from './helpers';

const total = (timestamp: string, count: number, sum: number, nodeId?: number): Metric => ({
  '@type': 'Histogram',
  metric: 'delivery.attempt-time',
  count,
  sum,
  timestamp,
  nodeId,
});

const sums = (samples: Metric[]) =>
  samples.reduce(
    (acc, m) => (m['@type'] === 'Histogram' ? { count: acc.count + m.count, sum: acc.sum + m.sum } : acc),
    { count: 0, sum: 0 },
  );

describe('deltaHistograms', () => {
  it('diffs one node’s running totals', () => {
    const out = deltaHistograms([
      total('2026-09-30T10:00:00Z', 10, 1000),
      total('2026-09-30T11:00:00Z', 12, 1400),
      total('2026-09-30T12:00:00Z', 15, 2000),
    ]);
    expect(sums(out)).toEqual({ count: 5, sum: 1000 });
  });

  it('diffs each node against itself, never against another node', () => {
    // A busy fast node and a quiet node with one slow attempt, interleaved
    const out = deltaHistograms([
      total('2026-09-30T10:00:00Z', 100, 20_000, 0),
      total('2026-09-30T10:00:01Z', 4, 300_000, 1),
      total('2026-09-30T11:00:00Z', 110, 22_000, 0),
      total('2026-09-30T11:00:01Z', 4, 300_000, 1),
      total('2026-09-30T12:00:00Z', 120, 24_000, 0),
      total('2026-09-30T12:00:01Z', 5, 301_000, 1),
    ]);
    expect(sums(out)).toEqual({ count: 21, sum: 5_000 });
  });

  it('skips a restart, where a node’s totals start again from zero', () => {
    const out = deltaHistograms([
      total('2026-09-30T10:00:00Z', 50, 5000, 2),
      total('2026-09-30T11:00:00Z', 3, 300, 2),
      total('2026-09-30T12:00:00Z', 5, 700, 2),
    ]);
    expect(sums(out)).toEqual({ count: 2, sum: 400 });
  });

  it('passes counters and gauges through untouched', () => {
    const counter: Metric = { '@type': 'Counter', metric: 'auth.success', count: 3, nodeId: 1 };
    expect(deltaHistograms([counter])).toEqual([counter]);
  });
});

const reading = (metric: string, timestamp: string, count: number, nodeId?: number): Metric => ({
  '@type': 'Gauge',
  metric,
  count,
  timestamp,
  nodeId,
});

describe('gaugeReading', () => {
  it('adds up each node’s latest reading of a per-node gauge', () => {
    const v = gaugeReading(
      [
        reading('server.memory', '2026-09-30T10:00:00Z', 100, 0),
        reading('server.memory', '2026-09-30T11:00:00Z', 180, 0),
        reading('server.memory', '2026-09-30T11:00:00Z', 200, 1),
        reading('server.memory', '2026-09-30T11:00:01Z', 220, 2),
      ],
      ['server.memory'],
    );
    expect(v).toBe(600);
  });

  it('takes the real cluster-wide count, not a drifted or zero copy', () => {
    const samples = [
      reading('queue.count', '2026-09-30T11:00:00Z', 8, 2),
      reading('queue.count', '2026-09-30T11:00:01Z', 2 ** 64 - 20, 0),
      reading('queue.count', '2026-09-30T11:00:02Z', 2 ** 64 - 3, 1),
      reading('user.count', '2026-09-30T11:00:00Z', 7, 2),
      reading('user.count', '2026-09-30T11:00:02Z', 0, 1),
    ];
    expect(gaugeReading(samples, ['queue.count'])).toBe(8);
    expect(gaugeReading(samples, ['user.count'])).toBe(7);
  });

  it('is null with no reading, or only an unbelievable one', () => {
    expect(gaugeReading([], ['server.memory'])).toBeNull();
    expect(gaugeReading([reading('queue.count', '2026-09-30T11:00:00Z', 2 ** 64 - 3, 0)], ['queue.count'])).toBeNull();
  });

  it('reads a single-node server (no nodeId) as before', () => {
    const v = gaugeReading(
      [reading('server.memory', '2026-09-30T10:00:00Z', 100), reading('server.memory', '2026-09-30T11:00:00Z', 150)],
      ['server.memory'],
    );
    expect(v).toBe(150);
  });
});

describe('seriesBucketValue', () => {
  it('reads a gauge slice across the nodes instead of adding up its ticks', () => {
    const slice = [
      reading('server.memory', '2026-09-30T10:00:00Z', 100, 0),
      reading('server.memory', '2026-09-30T10:01:00Z', 110, 0),
      reading('server.memory', '2026-09-30T10:00:30Z', 50, 1),
    ];
    expect(seriesBucketValue({ label: 'Memory', metrics: ['server.memory'] }, slice)).toBe(160);
  });
});
