/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Turning metric samples into what the dashboard draws: periods, slices, readings and labels. */
import type { Metric, MetricId, Period } from './types/metrics';
import { BUCKET_CONFIG, CUSTOM_BUCKET_COUNT, HOUR_MS, MIN_ZOOM_MS, PRESET_MS } from './types/metrics';
import type { Aggregate, Card, Chart, MetricFormat, Series } from './types/schema';

type Histogram = Extract<Metric, { '@type': 'Histogram' }>;

/** One number per sample: a counter's or gauge's count, a histogram's mean. */
export function metricToScalar(m: Metric): number {
  if (m['@type'] !== 'Histogram') return m.count;
  return m.count === 0 ? 0 : m.sum / m.count;
}

const timeOf = (m: Metric) => (m.timestamp ? Date.parse(m.timestamp) : 0);

/**
 * Histograms arrive as running totals; this turns each into the change
 * since the sample before, so a slice shows what happened in it. Totals
 * are per node, so each node is diffed on its own: diffing across nodes
 * would subtract one node's total from another's. A reset (a total going
 * down) yields nothing for that step. Other samples pass through first.
 */
export function deltaHistograms(samples: Metric[]): Metric[] {
  const others: Metric[] = [];
  const runs = new Map<string, Histogram[]>();
  for (const m of samples) {
    if (m['@type'] !== 'Histogram') {
      others.push(m);
      continue;
    }
    const key = `${m.metric}|${m.nodeId ?? ''}`;
    runs.set(key, [...(runs.get(key) ?? []), m]);
  }

  const deltas: Metric[] = [];
  for (const run of runs.values()) {
    run.sort((a, b) => timeOf(a) - timeOf(b));
    run.forEach((curr, i) => {
      if (i === 0) return;
      const count = curr.count - run[i - 1].count;
      const sum = curr.sum - run[i - 1].sum;
      if (count > 0 && sum >= 0) {
        deltas.push({ '@type': 'Histogram', metric: curr.metric, count, sum, timestamp: curr.timestamp });
      }
    });
  }
  return [...others, ...deltas];
}

/** The period's window; a preset ends now. */
export function periodWindow(p: Period): { from: Date; to: Date } {
  if (p.kind === 'custom') return { from: p.from, to: p.to };
  const to = new Date();
  return { from: new Date(to.getTime() - PRESET_MS[p.preset]), to };
}

/** A key that tells periods apart, for caching. */
export function periodKey(p: Period): string {
  return p.kind === 'custom' ? `custom|${p.from.toISOString()}|${p.to.toISOString()}` : p.preset;
}

/** How many slices to cut the period into: fixed per preset, a slice per hour for a zoom. */
export function getBucketCount(p: Period): number {
  if (p.kind === 'preset') return BUCKET_CONFIG[p.preset];
  const hours = Math.round((p.to.getTime() - p.from.getTime()) / HOUR_MS);
  return Math.min(CUSTOM_BUCKET_COUNT, Math.max(MIN_ZOOM_MS / HOUR_MS, hours));
}

function combine(values: number[], how: Aggregate | undefined): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((a, b) => a + b, 0);
  return how === 'avg' ? sum / values.length : sum;
}

/**
 * A series' value in one slice, or null when it has no samples there. Gauges
 * give one reading across the nodes, not every tick's readings combined.
 */
export function seriesBucketValue(series: Series, slice: Metric[]): number | null {
  const own = slice.filter((m) => series.metrics.includes(m.metric));
  if (own.length === 0) return null;
  if (own.every((m) => m['@type'] === 'Gauge')) return gaugeReading(own, series.metrics);
  return combine(own.map(metricToScalar), series.aggregate);
}

/**
 * Gauges that count the whole cluster. Only the node that computes them has
 * a true reading; history from before inbuxa-server 2026.9.30.2 also holds
 * the other nodes' copies, with the queue drifted below zero (stored
 * unsigned, so a 20-digit number) and the accounts and domains at 0.
 */
export const CLUSTER_GAUGES = new Set<MetricId>(['queue.count', 'user.count', 'domain.count']);

/**
 * The gauges' reading across the cluster: each node's latest, added up for
 * per-node gauges (memory, open connections), and for cluster-wide counts
 * the largest believable one. Null when there's no reading.
 */
export function gaugeReading(samples: Metric[], ids: MetricId[]): number | null {
  const latest = new Map<string, { metric: MetricId; at: number; value: number }>();
  for (const m of samples) {
    if (m['@type'] !== 'Gauge' || !ids.includes(m.metric)) continue;
    const key = `${m.metric}|${m.nodeId ?? ''}`;
    const at = timeOf(m);
    if ((latest.get(key)?.at ?? -Infinity) <= at) latest.set(key, { metric: m.metric, at, value: m.count });
  }
  if (latest.size === 0) return null;

  let total = 0;
  let any = false;
  const clusterWide = new Map<MetricId, number>();
  for (const { metric, value } of latest.values()) {
    if (!CLUSTER_GAUGES.has(metric)) {
      total += value;
      any = true;
    } else if (value <= Number.MAX_SAFE_INTEGER) {
      clusterWide.set(metric, Math.max(clusterWide.get(metric) ?? 0, value));
    }
  }
  for (const value of clusterWide.values()) {
    total += value;
    any = true;
  }
  return any ? total : null;
}

/** Samples by slice of the window; ones outside it, or without a time, are left out. */
export function bucketize(samples: Metric[], from: Date, to: Date, bucketCount: number): Metric[][] {
  const slices: Metric[][] = Array.from({ length: bucketCount }, () => []);
  const start = from.getTime();
  const span = to.getTime() - start;
  if (span <= 0) return slices;
  for (const m of samples) {
    if (!m.timestamp) continue;
    const offset = Date.parse(m.timestamp) - start;
    if (offset < 0 || offset > span) continue;
    slices[Math.min(bucketCount - 1, Math.floor((offset / span) * bucketCount))].push(m);
  }
  return slices;
}

/** The middle of each slice, where its point goes on a chart. */
export function bucketTimestamps(from: Date, to: Date, bucketCount: number): Date[] {
  const width = (to.getTime() - from.getTime()) / bucketCount;
  return Array.from({ length: bucketCount }, (_, i) => new Date(from.getTime() + width * (i + 0.5)));
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** A value as the dashboard shows it, in its metric's format. */
export function formatValue(value: number, format: MetricFormat): string {
  switch (format) {
    case 'number':
      if (Number.isInteger(value) && Math.abs(value) < 1000) return String(value);
      return new Intl.NumberFormat(undefined, {
        notation: Math.abs(value) >= 1000 ? 'compact' : 'standard',
        maximumFractionDigits: 1,
      }).format(value);
    case 'bytes': {
      if (value === 0) return '0 B';
      for (let unit = BYTE_UNITS.length - 1; unit >= 0; unit--) {
        const scaled = value / 1024 ** unit;
        if (scaled >= 1) return `${scaled.toFixed(scaled < 10 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
      }
      return `${value} B`;
    }
    case 'duration': {
      if (value === 0) return '0 ms';
      if (value < 1000) return `${Math.round(value)} ms`;
      if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
      const minutes = Math.floor(value / 60_000);
      const pair = (big: number, bigUnit: string, small: number, smallUnit: string) =>
        small > 0 ? `${big} ${bigUnit} ${small} ${smallUnit}` : `${big} ${bigUnit}`;
      if (minutes < 60) return pair(minutes, 'm', Math.floor((value % 60_000) / 1000), 's');
      return pair(Math.floor(minutes / 60), 'h', minutes % 60, 'm');
    }
    case 'percent':
      return `${value.toFixed(1)}%`;
    default:
      return String(value);
  }
}

/** A chart's time axis label: the time of day over a day or less, the date over longer. */
export function formatTimeTick(date: Date, period: Period): string {
  const withinDay =
    period.kind === 'preset'
      ? period.preset === '24h'
      : period.to.getTime() - period.from.getTime() <= PRESET_MS['24h'];
  return withinDay
    ? date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: '2-digit', day: '2-digit' });
}

/** The metrics to ask history for: the history cards' and every chart's. */
export function collectHistoryMetricIds(cards: Card[] | undefined, charts: Chart[] | undefined): Set<MetricId> {
  return new Set([
    ...(cards ?? []).filter((c) => c.source === 'history').flatMap((c) => c.metrics),
    ...(charts ?? []).flatMap((chart) => chart.series.flatMap((s) => s.metrics)),
  ]);
}

/** The metrics to stream live: the live cards'. */
export function collectLiveMetricIds(cards: Card[] | undefined): Set<MetricId> {
  return new Set((cards ?? []).filter((c) => c.source === 'live').flatMap((c) => c.metrics));
}

/**
 * The window a drag across slices `a` to `b` of a chart zooms to: from the
 * start of the first slice to the end of the last. A window under three
 * hours widens around its middle, staying inside the chart's own. Null when
 * the chart's window is already that narrow, so there's nothing to zoom into.
 */
export function zoomWindow(
  from: Date,
  to: Date,
  buckets: number,
  a: number,
  b: number,
): { from: Date; to: Date } | null {
  const start = from.getTime();
  const end = to.getTime();
  if (end - start <= MIN_ZOOM_MS || buckets <= 0) return null;
  const width = (end - start) / buckets;
  const first = Math.max(0, Math.min(a, b));
  const last = Math.min(buckets - 1, Math.max(a, b));
  let zoomFrom = start + first * width;
  let zoomTo = start + (last + 1) * width;
  if (zoomTo - zoomFrom < MIN_ZOOM_MS) {
    const middle = (zoomFrom + zoomTo) / 2;
    zoomFrom = Math.max(start, Math.min(end - MIN_ZOOM_MS, middle - MIN_ZOOM_MS / 2));
    zoomTo = zoomFrom + MIN_ZOOM_MS;
  }
  return { from: new Date(Math.round(zoomFrom)), to: new Date(Math.round(zoomTo)) };
}

/**
 * Which of `buckets` slices a pointer at `x` is over, on a plot from `left`
 * to `right`. Lines and areas put the slices on points, first at the left
 * edge and last at the right; bars put each in a band of its own.
 */
export function sliceAt(x: number, left: number, right: number, buckets: number, band: boolean): number | null {
  if (buckets <= 0 || right <= left) return null;
  const f = Math.min(1, Math.max(0, (x - left) / (right - left)));
  return Math.min(buckets - 1, band ? Math.floor(f * buckets) : Math.round(f * (buckets - 1)));
}
