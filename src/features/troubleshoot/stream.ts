/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { apiFetch, getApiBaseUrl } from '@/services/api';
import type { DeliveryStage } from './types';

/** A trace that hasn't completed by then is given up on. */
export const TRACE_TIMEOUT_MS = 120_000;

export type StreamFailure = { reason: 'lost' } | { reason: 'timeout' } | { reason: 'start'; message: string | null };

export interface StreamEvents {
  /** The stream is open; `startedAt` is when it was asked for. */
  opened: (startedAt: number) => void;
  /** A batch of steps, as the server sends them; the last batch ends with `completed`. */
  stages: (stages: DeliveryStage[], at: number) => void;
  failed: (failure: StreamFailure) => void;
}

/**
 * Runs a live delivery trace: a short-lived token from the API, then the
 * server's event stream of steps (EventSource can't send headers, hence
 * the token in the URL). Returns a function that stops it; after that,
 * nothing more is reported.
 */
export function streamDeliveryTrace(target: string, on: StreamEvents, timeoutMs = TRACE_TIMEOUT_MS): () => void {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const close = () => {
    closed = true;
    source?.close();
    source = null;
    clearTimeout(timer);
  };
  const fail = (failure: StreamFailure) => {
    close();
    on.failed(failure);
  };

  void (async () => {
    let token: string;
    try {
      token = await (await apiFetch('/api/token/delivery')).text();
    } catch (e) {
      if (!closed) fail({ reason: 'start', message: e instanceof Error ? e.message : null });
      return;
    }
    if (closed) return;

    const startedAt = Date.now();
    const es = new EventSource(
      `${getApiBaseUrl()}/api/live/delivery/${encodeURIComponent(target)}?token=${encodeURIComponent(token)}`,
    );
    source = es;
    timer = setTimeout(() => fail({ reason: 'timeout' }), timeoutMs);

    es.onopen = () => {
      if (!closed) on.opened(startedAt);
    };
    es.onerror = () => {
      if (!closed) fail({ reason: 'lost' });
    };
    es.addEventListener('event', (message) => {
      if (closed) return;
      let stages: DeliveryStage[];
      try {
        stages = JSON.parse((message as MessageEvent<string>).data) as DeliveryStage[];
      } catch (e) {
        console.error('Failed to parse delivery event:', e);
        return;
      }
      on.stages(stages, Date.now());
      if (stages.some((s) => s.type === 'completed')) close();
    });
  })();

  return close;
}
