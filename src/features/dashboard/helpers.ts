/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import type { Metric, MetricId, Period } from './types/metrics';
import type { Card, Series, MetricFormat, Aggregate } from './types/schema';
import { PRESET_MS, BUCKET_CONFIG, CUSTOM_BUCKET_COUNT, SPARKLINE_BUCKET_COUNT } from './types/metrics';

export function metricToScalar(m: Metric): number {
  if (m['@type'] === 'Histogram') {
    return m.count === 0 ? 0 : m.sum / m.count;
  }
  return m.count;
}

// INBUXA: histograms are running totals per node, so they're diffed per
// node; in a cluster, diffing across nodes subtracts one node's total from
// another's.
export function deltaHistograms(samples: Metric[]): Metric[] {
  const nonHistograms: Metric[] = [];
  const byMetric = new Map<string, Metric[]>();

  for (const m of samples) {
    if (m['@type'] !== 'Histogram') {
      nonHistograms.push(m);
      continue;
    }
    const key = `${m.metric}|${m.nodeId ?? ''}`;
    let list = byMetric.get(key);
    if (!list) {
      list = [];
      byMetric.set(key, list);
    }
    list.push(m);
  }

  const result = [...nonHistograms];

  for (const [, records] of byMetric) {
    records.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return ta - tb;
    });

    for (let i = 1; i < records.length; i++) {
      const prev = records[i - 1] as Metric & { '@type': 'Histogram' };
      const curr = records[i] as Metric & { '@type': 'Histogram' };
      const deltaCount = curr.count - prev.count;
      const deltaSum = curr.sum - prev.sum;

      if (deltaCount <= 0 || deltaSum < 0) continue;

      result.push({
        '@type': 'Histogram',
        metric: curr.metric,
        count: deltaCount,
        sum: deltaSum,
        timestamp: curr.timestamp,
      });
    }
  }

  return result;
}

export function periodWindow(p: Period): { from: Date; to: Date } {
  if (p.kind === 'custom') return { from: p.from, to: p.to };
  const to = new Date();
  const ms = PRESET_MS[p.preset];
  return { from: new Date(to.getTime() - ms), to };
}

export function periodKey(p: Period): string {
  if (p.kind === 'custom') return `custom|${p.from.toISOString()}|${p.to.toISOString()}`;
  return p.preset;
}

export function getBucketCount(p: Period): number {
  if (p.kind === 'custom') return CUSTOM_BUCKET_COUNT;
  return BUCKET_CONFIG[p.preset];
}

function aggregate(values: number[], agg: Aggregate | undefined): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  if (agg === 'avg') return sum / values.length;
  return sum;
}

export function cardValue(card: Card, samples: Metric[]): number {
  const values = samples.filter((m) => card.metrics.includes(m.metric)).map(metricToScalar);
  return aggregate(values, card.aggregate);
}

export function seriesBucketValue(series: Series, bucketSamples: Metric[]): number | null {
  const values = bucketSamples.filter((m) => series.metrics.includes(m.metric)).map(metricToScalar);
  if (values.length === 0) return null;
  return aggregate(values, series.aggregate);
}

export function bucketize(samples: Metric[], from: Date, to: Date, bucketCount: number): Metric[][] {
  const buckets: Metric[][] = Array.from({ length: bucketCount }, () => []);
  const span = to.getTime() - from.getTime();
  if (span <= 0) return buckets;
  for (const m of samples) {
    if (!m.timestamp) continue;
    const t = new Date(m.timestamp).getTime();
    if (t < from.getTime() || t > to.getTime()) continue;
    const idx = Math.min(bucketCount - 1, Math.floor(((t - from.getTime()) / span) * bucketCount));
    buckets[idx].push(m);
  }
  return buckets;
}

export function bucketTimestamps(from: Date, to: Date, bucketCount: number): Date[] {
  const span = to.getTime() - from.getTime();
  const width = span / bucketCount;
  return Array.from({ length: bucketCount }, (_, i) => new Date(from.getTime() + width * (i + 0.5)));
}

export function computeDelta(
  card: Card,
  samples: Metric[],
  from: Date,
  to: Date,
): { pct: number; direction: 'up' | 'down' | 'neutral' } | null {
  const mid = new Date((from.getTime() + to.getTime()) / 2);
  const firstHalf = samples.filter((m) => {
    if (!m.timestamp) return false;
    return new Date(m.timestamp).getTime() < mid.getTime();
  });
  const secondHalf = samples.filter((m) => {
    if (!m.timestamp) return false;
    return new Date(m.timestamp).getTime() >= mid.getTime();
  });

  const first = aggregate(firstHalf.filter((m) => card.metrics.includes(m.metric)).map(metricToScalar), card.aggregate);
  const second = aggregate(
    secondHalf.filter((m) => card.metrics.includes(m.metric)).map(metricToScalar),
    card.aggregate,
  );

  if (first === 0) return null;
  const pct = ((second - first) / Math.abs(first)) * 100;
  if (pct === 0) return { pct: 0, direction: 'neutral' };
  return { pct: Math.round(pct * 10) / 10, direction: pct > 0 ? 'up' : 'down' };
}

export function sparklineData(card: Card, samples: Metric[], from: Date, to: Date): number[] {
  const buckets = bucketize(samples, from, to, SPARKLINE_BUCKET_COUNT);
  return buckets.map((bucket) => {
    const values = bucket.filter((m) => card.metrics.includes(m.metric)).map(metricToScalar);
    return aggregate(values, card.aggregate);
  });
}

export function formatValue(value: number, format: MetricFormat): string {
  switch (format) {
    case 'number': {
      if (Number.isInteger(value) && Math.abs(value) < 1000) {
        return value.toString();
      }
      return new Intl.NumberFormat(undefined, {
        notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
        maximumFractionDigits: 1,
      }).format(value);
    }
    case 'bytes': {
      if (value === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      for (let i = units.length - 1; i >= 0; i--) {
        const factor = 1024 ** i;
        const v = value / factor;
        if (v >= 1) {
          const decimals = v < 10 ? 1 : 0;
          return `${v.toFixed(decimals)} ${units[i]}`;
        }
      }
      return `${value} B`;
    }
    case 'duration': {
      if (value === 0) return '0 ms';
      if (value < 1000) return `${Math.round(value)} ms`;
      if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
      const m = Math.floor(value / 60_000);
      const s = Math.floor((value % 60_000) / 1000);
      if (m < 60) return s > 0 ? `${m} m ${s} s` : `${m} m`;
      const h = Math.floor(m / 60);
      const rm = m % 60;
      return rm > 0 ? `${h} h ${rm} m` : `${h} h`;
    }
    case 'percent':
      return `${value.toFixed(1)}%`;
    default:
      return String(value);
  }
}

export function formatTimeTick(date: Date, period: Period): string {
  if (period.kind === 'preset') {
    switch (period.preset) {
      case '24h':
        return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      default:
        return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
    }
  }
  const span = period.to.getTime() - period.from.getTime();
  if (span <= 86_400_000) {
    return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
}

export function collectHistoryMetricIds(
  cards: Card[] | undefined,
  charts: import('./types/schema').Chart[] | undefined,
): Set<MetricId> {
  const ids = new Set<MetricId>();
  if (cards) {
    for (const card of cards) {
      if (card.source === 'history') {
        for (const id of card.metrics) ids.add(id);
      }
    }
  }
  if (charts) {
    for (const chart of charts) {
      for (const series of chart.series) {
        for (const id of series.metrics) ids.add(id);
      }
    }
  }
  return ids;
}

export function collectLiveMetricIds(cards: Card[] | undefined): Set<MetricId> {
  const ids = new Set<MetricId>();
  if (cards) {
    for (const card of cards) {
      if (card.source === 'live') {
        for (const id of card.metrics) ids.add(id);
      }
    }
  }
  return ids;
}
