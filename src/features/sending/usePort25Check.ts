/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: can this server reach other mail servers on port 25? Many hosting
 * providers block it, and then direct delivery can't work. This runs the
 * same live probe as Delivery tests against a big mail domain: an MX lookup,
 * a connection and the server's greeting. Nothing is sent.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getApiBaseUrl } from '@/services/api';
import type { DeliveryStage } from '@/features/troubleshoot/types';

export type Port25State =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'open'; host: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'unknown'; reason: string };

/** What a finished probe says about port 25. */
export function verdict(events: DeliveryStage[]): Port25State {
  let host = '';
  let lastError = '';
  for (const e of events) {
    if (e.type === 'deliveryAttemptStart') host = e.hostname;
    if (e.type === 'readGreetingSuccess') return { kind: 'open', host };
    if (e.type === 'connectionError' || e.type === 'readGreetingError') lastError = e.reason;
    if (e.type === 'mxLookupError') return { kind: 'unknown', reason: e.reason };
  }
  if (lastError) return { kind: 'blocked', reason: lastError };
  return { kind: 'unknown', reason: 'The check ended before connecting to any mail server.' };
}

const TIMEOUT_MS = 60_000;

export function usePort25Check() {
  const [state, setState] = useState<Port25State>({ kind: 'idle' });
  const source = useRef<EventSource | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    source.current?.close();
    source.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const run = useCallback(
    async (target: string) => {
      stop();
      setState({ kind: 'running' });
      try {
        const token = await (await apiFetch('/api/token/delivery')).text();
        const es = new EventSource(
          `${getApiBaseUrl()}/api/live/delivery/${encodeURIComponent(target)}?token=${encodeURIComponent(token)}`,
        );
        source.current = es;
        const events: DeliveryStage[] = [];
        const finish = (s: Port25State) => {
          stop();
          setState(s);
        };
        timer.current = setTimeout(
          () =>
            finish(
              verdict(events).kind === 'open'
                ? verdict(events)
                : { kind: 'blocked', reason: 'no mail server answered within a minute' },
            ),
          TIMEOUT_MS,
        );
        es.addEventListener('event', (msg) => {
          for (const stage of JSON.parse((msg as MessageEvent).data) as DeliveryStage[]) {
            if (stage.type === 'completed') return finish(verdict(events));
            events.push(stage);
            // One greeting is the answer; no need to wait for the rest.
            if (stage.type === 'readGreetingSuccess') return finish(verdict(events));
          }
        });
        es.onerror = () =>
          finish(events.length > 0 ? verdict(events) : { kind: 'unknown', reason: 'The check could not run.' });
      } catch (e) {
        setState({ kind: 'unknown', reason: e instanceof Error ? e.message : String(e) });
      }
    },
    [stop],
  );

  return { state, run };
}
