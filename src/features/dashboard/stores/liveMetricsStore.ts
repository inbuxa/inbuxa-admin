/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The live cards' stream: the latest sample of each metric asked for. A
 * dropped stream is reopened two seconds later, with a fresh token, for as
 * long as it takes. A tab hidden for a minute lets the stream go, and
 * opens it again when it's back in view.
 */
import { create } from 'zustand';
import type { Metric, MetricId } from '../types/metrics';
import { apiFetch, getApiBaseUrl } from '@/services/api';
import i18n from '@/i18n';

type LiveStatus = 'idle' | 'connecting' | 'open' | 'error' | 'closed';

interface LiveMetricsState {
  snapshot: Map<MetricId, Metric>;
  subscribedIds: Set<MetricId>;
  status: LiveStatus;
  error: string | null;

  /** Streams these metrics from 200 ms on, unless asked for others before then. */
  subscribe: (ids: Set<MetricId>) => void;
  unsubscribe: () => void;
}

const SUBSCRIBE_DELAY_MS = 200;
const RECONNECT_DELAY_MS = 2000;
const HIDDEN_CLOSE_MS = 60_000;
const INTERVAL_SECONDS = 30;

let stream: EventSource | null = null;
let subscribeTimer: ReturnType<typeof setTimeout> | undefined;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

function close() {
  stream?.close();
  stream = null;
  clearTimeout(reconnectTimer);
  reconnectTimer = undefined;
}

function liveMetricsUrl(token: string, ids: Set<MetricId>): string {
  // The API base, not this page's origin: the console may be served apart
  // from the server, and its own host would answer with the console itself.
  const metrics = encodeURIComponent([...ids].join(','));
  return `${getApiBaseUrl()}/api/live/metrics?token=${encodeURIComponent(token)}&interval=${INTERVAL_SECONDS}&metrics=${metrics}`;
}

function keepLatest(batch: Metric[]) {
  useLiveMetricsStore.setState((s) => {
    const snapshot = new Map(s.snapshot);
    for (const m of batch) snapshot.set(m.metric, m);
    return { snapshot };
  });
}

async function open(ids: Set<MetricId>) {
  close();
  if (ids.size === 0) {
    useLiveMetricsStore.setState({ status: 'idle', subscribedIds: ids });
    return;
  }
  useLiveMetricsStore.setState({ status: 'connecting', subscribedIds: ids, error: null });

  let token: string;
  try {
    token = await (await apiFetch('/api/token/metrics')).text();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : i18n.t('dashboard.liveMetricsFailed', 'Failed to connect to live metrics.');
    useLiveMetricsStore.setState({ status: 'error', error: message });
    return;
  }

  const source = new EventSource(liveMetricsUrl(token, ids));
  stream = source;
  source.addEventListener('metrics', (event) => {
    try {
      keepLatest(JSON.parse(event.data) as Metric[]);
    } catch (e) {
      console.error('Failed to parse live metrics:', e);
    }
  });
  source.onopen = () => useLiveMetricsStore.setState({ status: 'open' });
  source.onerror = () => {
    if (source !== stream) return;
    close();
    useLiveMetricsStore.setState({ status: 'connecting' });
    reconnectTimer = setTimeout(() => void open(useLiveMetricsStore.getState().subscribedIds), RECONNECT_DELAY_MS);
  };
}

function onVisibilityChange() {
  if (document.hidden) {
    hiddenTimer = setTimeout(() => {
      if (!stream) return;
      close();
      useLiveMetricsStore.setState({ status: 'closed' });
    }, HIDDEN_CLOSE_MS);
    return;
  }
  clearTimeout(hiddenTimer);
  hiddenTimer = undefined;
  const { status, subscribedIds } = useLiveMetricsStore.getState();
  if (status === 'closed' && subscribedIds.size > 0) void open(subscribedIds);
}

if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibilityChange);

export const useLiveMetricsStore = create<LiveMetricsState>()((set) => ({
  snapshot: new Map(),
  subscribedIds: new Set(),
  status: 'idle',
  error: null,

  subscribe: (ids) => {
    clearTimeout(subscribeTimer);
    subscribeTimer = setTimeout(() => void open(ids), SUBSCRIBE_DELAY_MS);
  },

  unsubscribe: () => {
    clearTimeout(subscribeTimer);
    close();
    set({ snapshot: new Map(), subscribedIds: new Set(), status: 'idle', error: null });
  },
}));
