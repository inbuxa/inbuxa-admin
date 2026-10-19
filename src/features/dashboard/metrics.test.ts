/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Metric } from './types/metrics';
import { PRESET_KEYS, presetLabel } from './types/metrics';
import type { Card, Chart } from './types/schema';
import {
  bucketize,
  bucketTimestamps,
  collectHistoryMetricIds,
  collectLiveMetricIds,
  formatTimeTick,
  formatValue,
  getBucketCount,
  metricToScalar,
  periodKey,
  periodWindow,
} from './helpers';

const at = (iso: string) => new Date(iso);
const counter = (metric: string, count: number, timestamp?: string): Metric => ({
  '@type': 'Counter',
  metric,
  count,
  timestamp,
});

afterEach(() => vi.useRealTimers());

describe('metricToScalar', () => {
  it('reads counters and gauges as their count, histograms as their mean', () => {
    expect(metricToScalar(counter('a', 7))).toBe(7);
    expect(metricToScalar({ '@type': 'Gauge', metric: 'g', count: 3 })).toBe(3);
    expect(metricToScalar({ '@type': 'Histogram', metric: 'h', count: 4, sum: 10 })).toBe(2.5);
    expect(metricToScalar({ '@type': 'Histogram', metric: 'h', count: 0, sum: 10 })).toBe(0);
  });
});

describe('periods', () => {
  it('ends a preset now and starts it its length before', () => {
    vi.useFakeTimers({ now: at('2026-10-18T12:00:00Z') });
    expect(periodWindow({ kind: 'preset', preset: '24h' })).toEqual({
      from: at('2026-10-17T12:00:00Z'),
      to: at('2026-10-18T12:00:00Z'),
    });
    expect(periodWindow({ kind: 'preset', preset: '90d' }).from).toEqual(at('2026-07-20T12:00:00Z'));
  });

  it('keeps a custom window as it is', () => {
    const p = { kind: 'custom' as const, from: at('2026-10-01T00:00:00Z'), to: at('2026-10-02T00:00:00Z') };
    expect(periodWindow(p)).toEqual({ from: p.from, to: p.to });
    expect(periodKey(p)).toBe('custom|2026-10-01T00:00:00.000Z|2026-10-02T00:00:00.000Z');
    expect(periodKey({ kind: 'preset', preset: '7d' })).toBe('7d');
  });

  it('slices each preset its own way', () => {
    expect(PRESET_KEYS.map((preset) => getBucketCount({ kind: 'preset', preset }))).toEqual([48, 56, 60, 90]);
  });

  it('names the presets', () => {
    const t = (_: string, fallback: string) => fallback;
    expect(PRESET_KEYS.map((k) => presetLabel(t, k))).toEqual([
      'Last 24 hours',
      'Last 7 days',
      'Last 30 days',
      'Last 90 days',
    ]);
  });
});

describe('bucketize', () => {
  const from = at('2026-10-18T00:00:00Z');
  const to = at('2026-10-18T04:00:00Z');

  it('drops each sample into its slice of the window, the end into the last', () => {
    const buckets = bucketize(
      [
        counter('a', 1, '2026-10-18T00:00:00Z'),
        counter('a', 2, '2026-10-18T01:59:59Z'),
        counter('a', 3, '2026-10-18T02:00:00Z'),
        counter('a', 4, '2026-10-18T04:00:00Z'),
        counter('a', 5, '2026-10-18T04:00:01Z'),
        counter('a', 6, '2026-10-17T23:59:59Z'),
        counter('a', 7),
      ],
      from,
      to,
      2,
    );
    expect(buckets.map((b) => b.map((m) => m.count))).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it('gives empty slices for an empty window', () => {
    expect(bucketize([counter('a', 1, '2026-10-18T00:00:00Z')], to, to, 3)).toEqual([[], [], []]);
  });

  it('times each slice by its middle', () => {
    expect(bucketTimestamps(from, to, 2)).toEqual([at('2026-10-18T01:00:00Z'), at('2026-10-18T03:00:00Z')]);
  });
});

describe('formatValue', () => {
  it.each([
    [0, 'number', '0'],
    [999, 'number', '999'],
    [-42, 'number', '-42'],
    [1.25, 'number', '1.3'],
    [1500, 'number', '1.5K'],
    [2_000_000, 'number', '2M'],
    [0, 'bytes', '0 B'],
    [512, 'bytes', '512 B'],
    [1536, 'bytes', '1.5 KB'],
    [52_428_800, 'bytes', '50 MB'],
    [0.5, 'bytes', '0.5 B'],
    [5 * 1024 ** 4, 'bytes', '5.0 TB'],
    [0, 'duration', '0 ms'],
    [12.4, 'duration', '12 ms'],
    [1500, 'duration', '1.5 s'],
    [120_000, 'duration', '2 m'],
    [125_000, 'duration', '2 m 5 s'],
    [3_600_000, 'duration', '1 h'],
    [5_520_000, 'duration', '1 h 32 m'],
    [12.345, 'percent', '12.3%'],
  ] as const)('%s as %s is %s', (value, format, text) => {
    expect(formatValue(value, format)).toBe(text);
  });

  it('shows an unknown format as the plain number', () => {
    expect(formatValue(3.5, 'other' as never)).toBe('3.5');
  });
});

describe('formatTimeTick', () => {
  const date = at('2026-10-18T15:30:00Z');
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const day = date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });

  it('shows the time of day over a day or less, the date over longer', () => {
    expect(formatTimeTick(date, { kind: 'preset', preset: '24h' })).toBe(time);
    expect(formatTimeTick(date, { kind: 'preset', preset: '7d' })).toBe(day);
    const custom = (hours: number) => ({
      kind: 'custom' as const,
      from: at('2026-10-18T00:00:00Z'),
      to: new Date(Date.parse('2026-10-18T00:00:00Z') + hours * 3_600_000),
    });
    expect(formatTimeTick(date, custom(24))).toBe(time);
    expect(formatTimeTick(date, custom(25))).toBe(day);
  });
});

describe('metric ids to fetch', () => {
  const card = (source: 'live' | 'history', metrics: string[]) =>
    ({ title: '', icon: '', source, metrics, format: 'number' }) as Card;
  const cards = [card('live', ['a', 'b']), card('history', ['c']), card('live', ['b'])];
  const charts = [
    {
      title: '',
      kind: 'line',
      series: [
        { label: '', metrics: ['d', 'c'] },
        { label: '', metrics: ['e'] },
      ],
    },
  ] as Chart[];

  it('asks history for the history cards and every chart', () => {
    expect([...collectHistoryMetricIds(cards, charts)]).toEqual(['c', 'd', 'e']);
    expect(collectHistoryMetricIds(undefined, undefined).size).toBe(0);
  });

  it('asks the live stream for the live cards', () => {
    expect([...collectLiveMetricIds(cards)]).toEqual(['a', 'b']);
    expect(collectLiveMetricIds(undefined).size).toBe(0);
  });
});
