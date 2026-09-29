/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo, useState } from 'react';
import type { Metric, MetricId } from './types/metrics';
import { useDashboardStore } from './stores/dashboardStore';
import { useHistoryMetricsStore } from './stores/historyMetricsStore';
import { deltaHistograms, periodKey, periodWindow } from './helpers';

/**
 * A dashboard page's own metrics over the chosen period: fetched when the
 * page or period changes, and fetched again on every refresh, keeping the
 * last numbers on screen meanwhile. The window slides forward with each
 * refresh, so "last 24 hours" stays the last 24 hours.
 */
export function usePageHistory(cacheId: string, ids: Set<MetricId>) {
  const period = useDashboardStore((s) => s.period);
  const tick = useDashboardStore((s) => s.tick);
  const fetchHistory = useHistoryMetricsStore((s) => s.fetch);
  const refreshHistory = useHistoryMetricsStore((s) => s.refresh);
  const historyCache = useHistoryMetricsStore((s) => s.cache);
  const cacheKey = `${cacheId}|${periodKey(period)}`;
  const [version, setVersion] = useState(0);
  const [firstTick] = useState(tick);

  useEffect(() => {
    if (ids.size === 0) return;
    let cancelled = false;
    // A tick since the page opened asks for fresh numbers, not the cache.
    const load = tick !== firstTick ? refreshHistory : fetchHistory;
    load(cacheId, period, ids).then(() => {
      if (!cancelled) setVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [cacheId, period, ids, tick, firstTick, fetchHistory, refreshHistory]);

  const samples = useMemo<Metric[]>(() => {
    void version;
    return deltaHistograms(historyCache.get(cacheKey)?.metrics ?? []);
  }, [historyCache, cacheKey, version]);
  const window = useMemo(() => periodWindow(period), [period, version]); // eslint-disable-line react-hooks/exhaustive-deps

  return { samples, window, period };
}
