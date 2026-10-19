/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Live tracing: the server's event stream, kept open through short drops, and the buffer the page shows. */
import { apiFetch, getApiBaseUrl } from '@/services/api';
import { normalizeTraceEvents } from './normalize';
import type { TraceEvent } from './types';

/** The page keeps the newest events up to this many. */
export const MAX_EVENTS = 1000;
/** A dropped stream is reopened this many times in a row, this far apart, before the page gives up. */
const RETRIES = 5;
const RETRY_DELAY_MS = 2000;

export interface LiveBuffer {
  events: TraceEvent[];
  /** The first event's timestamp, which the offsets count from; it stays when old events are dropped. */
  anchor: string;
}

export function appendEvents(buffer: LiveBuffer, batch: TraceEvent[]): LiveBuffer {
  const events = [...buffer.events, ...batch];
  return {
    events: events.length > MAX_EVENTS ? events.slice(-MAX_EVENTS) : events,
    anchor: buffer.anchor || (batch[0]?.timestamp ?? ''),
  };
}

/** A key = value filter on the stream; `label` is the key's name for people. */
export interface KeyFilter {
  key: string;
  label: string;
  value: string;
}

/** The stream's query, less the token: any keywords, and each filter as its own parameter. */
export function liveTracingQuery(keywords: string, filters: KeyFilter[]): string {
  const query = new URLSearchParams();
  if (keywords.trim()) query.set('filter', keywords.trim());
  for (const { key, value } of filters) query.set(key, value);
  return query.toString();
}

export type LiveFailure = { reason: 'disconnected' } | { reason: 'start'; message: string | null };

export interface LiveEvents {
  opened: () => void;
  events: (batch: TraceEvent[]) => void;
  failed: (failure: LiveFailure) => void;
}

/**
 * Opens the live trace stream. `query` is everything but the token, which
 * is fetched first, as EventSource can't send headers. Returns a function
 * that stops it for good: no reconnects and no more callbacks after it.
 */
export function streamLiveTrace(query: string, on: LiveEvents): () => void {
  let source: EventSource | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let retries = 0;

  const stop = () => {
    stopped = true;
    clearTimeout(retry);
    source?.close();
    source = null;
  };

  const connect = (url: string) => {
    const es = new EventSource(url);
    source = es;
    es.onopen = () => {
      if (stopped) return;
      retries = 0;
      on.opened();
    };
    es.addEventListener('trace', (message) => {
      if (stopped) return;
      let batch: TraceEvent[];
      try {
        batch = normalizeTraceEvents(JSON.parse((message as MessageEvent<string>).data));
      } catch (e) {
        console.error('Failed to parse trace event:', e);
        return;
      }
      on.events(batch);
    });
    es.onerror = () => {
      if (stopped || es !== source) return;
      es.close();
      source = null;
      if (retries < RETRIES) {
        retries++;
        retry = setTimeout(() => connect(url), RETRY_DELAY_MS);
      } else {
        stopped = true;
        on.failed({ reason: 'disconnected' });
      }
    };
  };

  void (async () => {
    let token: string;
    try {
      token = await (await apiFetch('/api/token/tracing')).text();
    } catch (e) {
      if (!stopped) on.failed({ reason: 'start', message: e instanceof Error ? e.message : null });
      return;
    }
    if (stopped) return;
    const rest = query ? `&${query}` : '';
    connect(`${getApiBaseUrl()}/api/live/tracing?token=${encodeURIComponent(token)}${rest}`);
  })();

  return stop;
}
