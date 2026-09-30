/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Metric } from './types/metrics';
import { deltaHistograms } from './helpers';

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
