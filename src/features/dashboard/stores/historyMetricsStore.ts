/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { create } from 'zustand';
import type { Metric, MetricId, Period } from '../types/metrics';
import { periodWindow, periodKey } from '../helpers';
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
  refresh: (dashboardId: string, period: Period, ids: Set<MetricId>) => Promise<Metric[]>;
}

async function fetchMetrics(period: Period, ids: Set<MetricId>): Promise<Metric[]> {
  if (ids.size === 0) return [];

  const { from, to } = periodWindow(period);
  const accountId = getAccountId('x:Metric');
  const metricIds = Array.from(ids);

  const result = await jmapQueryAllAndGet('x:Metric', accountId, {
    filter: {
      timestampIsGreaterThanOrEqual: from.toISOString(),
      timestampIsLessThanOrEqual: to.toISOString(),
      metric: metricIds,
    },
  });

  return result.list as Metric[];
}

export const useHistoryMetricsStore = create<HistoryMetricsState>()((set, get) => ({
  cache: new Map(),
  status: new Map(),
  error: new Map(),

  fetch: async (dashboardId, period, ids) => {
    const key = `${dashboardId}|${periodKey(period)}`;
    const existing = get().cache.get(key);

    if (existing && Date.now() - existing.fetchedAt < STALE_MS) {
      return existing.metrics;
    }

    if (get().status.get(key) === 'loading') {
      return existing?.metrics ?? [];
    }

    set((state) => ({
      status: new Map(state.status).set(key, 'loading'),
    }));

    try {
      const metrics = await fetchMetrics(period, ids);
      set((state) => ({
        cache: new Map(state.cache).set(key, { metrics, fetchedAt: Date.now() }),
        status: new Map(state.status).set(key, 'idle'),
        error: new Map([...state.error].filter(([k]) => k !== key)),
      }));
      return metrics;
    } catch (e) {
      const msg = e instanceof Error ? e.message : i18n.t('dashboard.failedFetchMetrics', 'Failed to fetch metrics');
      set((state) => ({
        status: new Map(state.status).set(key, 'error'),
        error: new Map(state.error).set(key, msg),
      }));
      return existing?.metrics ?? [];
    }
  },

  invalidate: (dashboardId) => {
    set((state) => {
      const newCache = new Map(state.cache);
      for (const key of newCache.keys()) {
        if (key.startsWith(`${dashboardId}|`)) {
          newCache.delete(key);
        }
      }
      return { cache: newCache };
    });
  },

  refresh: async (dashboardId, period, ids) => {
    const key = `${dashboardId}|${periodKey(period)}`;
    // INBUXA: mark the entry stale rather than dropping it, so the dashboard
    // keeps showing the last numbers until the new ones arrive instead of
    // blanking every instrument for the length of the fetch.
    set((state) => {
      const entry = state.cache.get(key);
      if (!entry) return {};
      return { cache: new Map(state.cache).set(key, { ...entry, fetchedAt: 0 }) };
    });
    return get().fetch(dashboardId, period, ids);
  },
}));
