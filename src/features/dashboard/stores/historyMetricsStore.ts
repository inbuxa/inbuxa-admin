/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Stored metric samples, per dashboard and period. An answer is reused for a
 * minute; asking again while a fetch is out waits for nothing and returns
 * what's there, and a failed fetch keeps the last numbers.
 */
import { create } from 'zustand';
import type { Metric, MetricId, Period } from '../types/metrics';
import { periodKey, periodWindow } from '../helpers';
import { getAccountId, jmapQueryAllAndGet } from '@/services/jmap/client';
import i18n from '@/i18n';

type FetchStatus = 'idle' | 'loading' | 'error';

const STALE_MS = 60_000;

interface CacheEntry {
  metrics: Metric[];
  fetchedAt: number;
}

interface HistoryMetricsState {
  cache: Map<string, CacheEntry>;
  status: Map<string, FetchStatus>;
  error: Map<string, string>;

  fetch: (dashboardId: string, period: Period, ids: Set<MetricId>) => Promise<Metric[]>;
  invalidate: (dashboardId: string) => void;
  /** Fetches again now, still showing the last numbers until the new ones arrive. */
  refresh: (dashboardId: string, period: Period, ids: Set<MetricId>) => Promise<Metric[]>;
}

const cacheKey = (dashboardId: string, period: Period) => `${dashboardId}|${periodKey(period)}`;

async function load(period: Period, ids: Set<MetricId>): Promise<Metric[]> {
  if (ids.size === 0) return [];
  const { from, to } = periodWindow(period);
  const { list } = await jmapQueryAllAndGet('x:Metric', getAccountId('x:Metric'), {
    filter: {
      timestampIsGreaterThanOrEqual: from.toISOString(),
      timestampIsLessThanOrEqual: to.toISOString(),
      metric: [...ids],
    },
  });
  return list as Metric[];
}

const withEntry = <V>(map: Map<string, V>, key: string, value: V) => new Map(map).set(key, value);

const without = <V>(map: Map<string, V>, drop: (key: string) => boolean) =>
  new Map([...map].filter(([key]) => !drop(key)));

export const useHistoryMetricsStore = create<HistoryMetricsState>()((set, get) => ({
  cache: new Map(),
  status: new Map(),
  error: new Map(),

  fetch: async (dashboardId, period, ids) => {
    const key = cacheKey(dashboardId, period);
    const cached = get().cache.get(key);
    if (cached && Date.now() - cached.fetchedAt < STALE_MS) return cached.metrics;
    if (get().status.get(key) === 'loading') return cached?.metrics ?? [];

    set((s) => ({ status: withEntry(s.status, key, 'loading') }));
    try {
      const metrics = await load(period, ids);
      set((s) => ({
        cache: withEntry(s.cache, key, { metrics, fetchedAt: Date.now() }),
        status: withEntry(s.status, key, 'idle'),
        error: without(s.error, (k) => k === key),
      }));
      return metrics;
    } catch (e) {
      const message =
        e instanceof Error ? e.message : i18n.t('dashboard.failedFetchMetrics', 'Failed to fetch metrics');
      set((s) => ({ status: withEntry(s.status, key, 'error'), error: withEntry(s.error, key, message) }));
      return cached?.metrics ?? [];
    }
  },

  invalidate: (dashboardId) => set((s) => ({ cache: without(s.cache, (key) => key.startsWith(`${dashboardId}|`)) })),

  refresh: (dashboardId, period, ids) => {
    const key = cacheKey(dashboardId, period);
    set((s) => {
      const cached = s.cache.get(key);
      return cached ? { cache: withEntry(s.cache, key, { ...cached, fetchedAt: 0 }) } : {};
    });
    return get().fetch(dashboardId, period, ids);
  },
}));
