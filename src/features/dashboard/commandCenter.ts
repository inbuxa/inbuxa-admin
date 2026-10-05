/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The command center's arithmetic: which metrics it reads, and how raw
 * samples become the numbers on its gauges, readouts and meters. Kept apart
 * from the components so every figure can be tested on its own.
 */
import type { Metric } from './types/metrics';
import { bucketize, gaugeReading, metricToScalar } from './helpers';

/** Messages the server took in from outside. */
export const RECEIVED = ['queue.message-queued'];
/** Messages the server sent: people's mail, bounces and reports. */
export const SENT = ['queue.authenticated-message-queued', 'queue.dsn-queued', 'queue.report-queued'];
export const SPAM = ['message-ingest.spam'];
export const HAM = ['message-ingest.ham'];
export const AUTH_FAILED = ['auth.failed'];
export const BANS = ['security.authentication-ban', 'security.abuse-ban', 'security.scan-ban', 'security.loiter-ban'];
export const DMARC_WARNINGS = ['incoming-report.dmarc-report-with-warnings'];
export const TLS_WARNINGS = ['incoming-report.tls-report-with-warnings'];

export interface Latency {
  id: string;
  metric: string;
  /** Below this is good (ms). */
  good: number;
  /** Above this needs a look (ms); the meter's full scale is twice this. */
  bad: number;
}

/**
 * The timings worth watching, with where "fine" ends and "slow" begins.
 * The bounds are rules of thumb for a mail server on ordinary hardware.
 */
export const LATENCIES: Latency[] = [
  { id: 'ingest', metric: 'message-ingest.time', good: 500, bad: 2000 },
  { id: 'index', metric: 'message-ingest.index-time', good: 500, bad: 2000 },
  { id: 'dns', metric: 'dns.lookup-time', good: 150, bad: 1000 },
  { id: 'delivery', metric: 'delivery.attempt-time', good: 2000, bad: 10000 },
  { id: 'dataRead', metric: 'store.data-read-time', good: 20, bad: 200 },
  { id: 'dataWrite', metric: 'store.data-write-time', good: 50, bad: 500 },
  { id: 'blobRead', metric: 'store.blob-read-time', good: 50, bad: 500 },
  { id: 'blobWrite', metric: 'store.blob-write-time', good: 100, bad: 1000 },
];

export interface Protocol {
  id: string;
  label: string;
  metric: string;
}

/** Open connections, by what they're speaking. */
export const PROTOCOLS: Protocol[] = [
  { id: 'smtp', label: 'SMTP', metric: 'smtp.active-connections' },
  { id: 'imap', label: 'IMAP', metric: 'imap.active-connections' },
  { id: 'pop3', label: 'POP3', metric: 'pop3.active-connections' },
  { id: 'http', label: 'HTTP', metric: 'http.active-connections' },
  { id: 'sieve', label: 'Sieve', metric: 'sieve.active-connections' },
  { id: 'out', label: 'OUT', metric: 'delivery.active-connections' },
];

/** Where the command center's metrics are cached; the shell fetches them for every page. */
export const COMMAND_CACHE = 'command-center';

export const LIVE_IDS = new Set<string>([
  'user.count',
  'domain.count',
  'queue.count',
  'server.memory',
  ...PROTOCOLS.map((p) => p.metric),
]);

export const HISTORY_IDS = new Set<string>([
  ...RECEIVED,
  ...SENT,
  ...SPAM,
  ...HAM,
  ...AUTH_FAILED,
  ...BANS,
  ...DMARC_WARNINGS,
  ...TLS_WARNINGS,
  ...LATENCIES.map((l) => l.metric),
]);

/** Every event counted over the period, across the given metrics. */
export function total(samples: Metric[], ids: string[]): number {
  let n = 0;
  for (const s of samples) if (ids.includes(s.metric)) n += s.count;
  return n;
}

/** The average of a timing over the period, weighted by how often it happened; null if it never did. */
export function mean(samples: Metric[], ids: string[]): number | null {
  let sum = 0;
  let count = 0;
  for (const s of samples) {
    if (!ids.includes(s.metric) || s['@type'] !== 'Histogram') continue;
    sum += s.sum;
    count += s.count;
  }
  return count > 0 ? sum / count : null;
}

/** Counts per time slice across the period, oldest first. */
export function series(samples: Metric[], ids: string[], from: Date, to: Date, buckets: number): number[] {
  return bucketize(samples, from, to, buckets).map((b) => {
    const mine = b.filter((m) => ids.includes(m.metric));
    // A gauge's slice is one reading across the nodes, not the sum of every tick
    if (mine.length > 0 && mine.every((m) => m['@type'] === 'Gauge')) return gaugeReading(mine, ids) ?? 0;
    return mine.reduce((s, m) => s + metricToScalar(m), 0);
  });
}

export interface Load {
  /** Messages in the latest complete slice. */
  now: number;
  /** The busiest slice in the period. */
  peak: number;
  /** now as a share of peak, 0–1. */
  ratio: number;
}

/**
 * How busy the server is right now against its busiest moment in the period.
 * The newest slice is still filling, so "now" is the one before it, unless
 * the newest has already overtaken it.
 */
export function load(flow: number[]): Load {
  const peak = Math.max(0, ...flow);
  const last = flow.at(-1) ?? 0;
  const prev = flow.at(-2) ?? 0;
  const now = Math.max(last, prev);
  return { now, peak, ratio: peak > 0 ? now / peak : 0 };
}

export type Zone = 'good' | 'fair' | 'slow';

export function zoneOf(ms: number, l: Pick<Latency, 'good' | 'bad'>): Zone {
  if (ms <= l.good) return 'good';
  if (ms <= l.bad) return 'fair';
  return 'slow';
}

/** Share of queued recipients that are simply waiting their turn, 0–1; 1 when the queue is empty. */
export function queueHealth(waiting: { scheduled: number; retrying: number; failed: number }[] | undefined): number {
  let ok = 0;
  let all = 0;
  for (const w of waiting ?? []) {
    ok += w.scheduled;
    all += w.scheduled + w.retrying + w.failed;
  }
  return all === 0 ? 1 : ok / all;
}

/** Accounts at or past the given share of their quota. */
export function nearQuota(storage: { used: number; quota: number | null }[] | undefined, share = 0.9): number {
  return (storage ?? []).filter((a) => a.quota && a.used >= a.quota * share).length;
}

/** The last reading of a level (a gauge metric such as queue size) in the period; null if none. */
export function latest(samples: Metric[], ids: string[]): number | null {
  let at = -Infinity;
  let v: number | null = null;
  for (const s of samples) {
    if (!ids.includes(s.metric) || !s.timestamp) continue;
    const t = Date.parse(s.timestamp);
    if (t >= at) {
      at = t;
      v = s.count;
    }
  }
  return v;
}

/**
 * One figure for a metric over the period, the way it's meant to be read:
 * an average for timings, the latest reading for levels, a total for counts.
 */
export function summarize(samples: Metric[], ids: string[], timing: boolean): number | null {
  if (timing) return mean(samples, ids);
  const mine = samples.filter((s) => ids.includes(s.metric));
  if (mine.length > 0 && mine.every((s) => s['@type'] === 'Gauge')) return gaugeReading(mine, ids);
  return total(samples, ids);
}

export const CONNECTION_STARTS = [
  'smtp.connection-start',
  'imap.connection-start',
  'pop3.connection-start',
  'http.connection-start',
  'manage-sieve.connection-start',
];

/** What each trend page's instruments read, beyond what the page's own cards and charts fetch. */
export const DECK_METRICS: Record<string, string[]> = {
  network: [...CONNECTION_STARTS, 'delivery.attempt-start'],
  security: ['security.ip-blocked', ...BANS, ...AUTH_FAILED, ...SPAM, ...HAM],
  delivery: [...RECEIVED, ...SENT, 'delivery.attempt-time'],
  performance: [...LATENCIES.map((l) => l.metric), 'server.memory'],
  storage: LATENCIES.filter((l) => l.metric.startsWith('store.')).map((l) => l.metric),
};

/** How the nodes talk to each other: errors and dropped links between them. */
export const COORDINATION = ['cluster.subscriber-error', 'cluster.publisher-error', 'cluster.subscriber-disconnected'];
/** The shared data layer the nodes stand on: every store backend's errors. */
export const STORE_ERRORS = [
  'store.foundationdb-error',
  'store.mysql-error',
  'store.postgresql-error',
  'store.rocksdb-error',
  'store.sqlite-error',
  'store.ldap-error',
  'store.elasticsearch-error',
  'store.redis-error',
  'store.s3-error',
  'store.azure-error',
  'store.filesystem-error',
  'store.pool-error',
  'store.unexpected-error',
  'store.http-store-error',
];
export const THREAD_ERRORS = ['server.thread-error'];
/** inbuxa: what each node handled, for the strips on its card in the cluster roster. */
export const NODE_MAIL = [...RECEIVED, ...SENT];
export const CLUSTER_IDS = new Set([
  ...COORDINATION,
  ...STORE_ERRORS,
  ...THREAD_ERRORS,
  ...NODE_MAIL,
  ...CONNECTION_STARTS,
]);

/**
 * inbuxa: one node's share of `series`: only the samples it wrote. Servers
 * before 2026.9.30 don't say which node wrote a sample, so nothing matches.
 */
export function nodeSeries(
  samples: Metric[],
  nodeId: number,
  ids: string[],
  from: Date,
  to: Date,
  buckets: number,
): number[] {
  return series(
    samples.filter((m) => m.nodeId === nodeId),
    ids,
    from,
    to,
    buckets,
  );
}

/** A node is reported stale when it hasn't renewed its lease in this long. */
export const STALE_AFTER_MS = 3 * 60_000;

/** The share of the period's slices with nothing in them, 0–1; 1 for an empty period. */
export function cleanShare(slices: number[]): number {
  if (slices.length === 0) return 1;
  return slices.filter((v) => v === 0).length / slices.length;
}
