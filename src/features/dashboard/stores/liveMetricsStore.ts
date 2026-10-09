/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { create } from 'zustand';
import type { MetricId, Metric } from '../types/metrics';
import { apiFetch, getApiBaseUrl } from '@/services/api';
import i18n from '@/i18n';

type LiveStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

interface LiveMetricsState {
  snapshot: Map<MetricId, Metric>;
  subscribedIds: Set<MetricId>;
  status: LiveStatus;
  error: string | null;

  subscribe: (ids: Set<MetricId>) => void;
  unsubscribe: () => void;
  handleBatch: (batch: Metric[]) => void;
}

let eventSource: EventSource | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT = 5;
const RECONNECT_DELAY = 2000;

function cleanup() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
}

async function openStream(ids: Set<MetricId>) {
  cleanup();

  if (ids.size === 0) {
    useLiveMetricsStore.setState({ status: 'idle', subscribedIds: ids });
    return;
  }

  useLiveMetricsStore.setState({ status: 'connecting', subscribedIds: ids, error: null });

  try {
    const tokenResponse = await apiFetch('/api/token/metrics');
    const token = await tokenResponse.text();

    const metricsParam = Array.from(ids).join(',');
    const url = `${getOrigin()}/api/live/metrics?token=${encodeURIComponent(token)}&interval=30&metrics=${encodeURIComponent(metricsParam)}`;

    const es = new EventSource(url);
    eventSource = es;
    reconnectAttempts = 0;

    es.addEventListener('metrics', (event) => {
      try {
        const batch = JSON.parse(event.data) as Metric[];
        useLiveMetricsStore.getState().handleBatch(batch);
      } catch (e) {
        console.error('Failed to parse live metrics:', e);
      }
    });

    es.onopen = () => {
      useLiveMetricsStore.setState({ status: 'open' });
    };

    es.onerror = () => {
      if (es !== eventSource) return;
      es.close();
      eventSource = null;

      if (reconnectAttempts < MAX_RECONNECT) {
        reconnectAttempts++;
        useLiveMetricsStore.setState({ status: 'connecting' });
        reconnectTimer = setTimeout(() => {
          const currentIds = useLiveMetricsStore.getState().subscribedIds;
          openStream(currentIds);
        }, RECONNECT_DELAY);
      } else {
        useLiveMetricsStore.setState({
          status: 'error',
          error: i18n.t(
            'dashboard.liveMetricsDisconnected',
            'Live metrics stream disconnected after multiple retries.',
          ),
        });
      }
    };
  } catch (e) {
    useLiveMetricsStore.setState({
      status: 'error',
      error:
        e instanceof Error ? e.message : i18n.t('dashboard.liveMetricsFailed', 'Failed to connect to live metrics.'),
    });
  }
}

function getOrigin(): string {
  // Honor the deploy-time API base (VITE_API_BASE_URL or the api-base-url
  // meta tag) exactly like every other /api/live caller. Using
  // window.location.origin here breaks Dashboard live metrics in any split
  // deployment where the Admin origin is not the server (e.g. Admin in Docker
  // pointed at the server via API_BASE_URL): the EventSource hits the Admin
  // nginx instead, which answers with the SPA shell.
  return getApiBaseUrl();
}

let visibilityTimer: ReturnType<typeof setTimeout> | null = null;

function handleVisibilityChange() {
  if (document.hidden) {
    visibilityTimer = setTimeout(() => {
      if (eventSource) {
        cleanup();
        useLiveMetricsStore.setState({ status: 'closed' });
      }
    }, 60_000);
  } else {
    if (visibilityTimer) {
      clearTimeout(visibilityTimer);
      visibilityTimer = null;
    }
    const state = useLiveMetricsStore.getState();
    if (state.status === 'closed' && state.subscribedIds.size > 0) {
      openStream(state.subscribedIds);
    }
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', handleVisibilityChange);
}

export const useLiveMetricsStore = create<LiveMetricsState>()((set) => ({
  snapshot: new Map(),
  subscribedIds: new Set(),
  status: 'idle',
  error: null,

  subscribe: (ids) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      openStream(ids);
    }, 200);
  },

  unsubscribe: () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    cleanup();
    set({ snapshot: new Map(), subscribedIds: new Set(), status: 'idle', error: null });
  },

  handleBatch: (batch) => {
    set((state) => {
      const next = new Map(state.snapshot);
      for (const m of batch) {
        next.set(m.metric, m);
      }
      return { snapshot: next };
    });
  },
}));
