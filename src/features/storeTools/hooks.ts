/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: loading, acting and formatting for the store check, snapshot and
 * blob store change pages.
 */

import { useCallback, useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { StoreToolUnavailable } from './api';

/** How often a page looks again while something runs; the server saves progress every 10 seconds. */
const RUNNING_POLL_MS = 3_000;

export type Load<T> = { kind: 'loading' } | { kind: 'ready'; items: T[] } | { kind: 'error'; message: string };

/**
 * Loads a list, and loads it again every few seconds while `running` says
 * something in it is still moving. `refetch` loads it now.
 */
export function usePolledList<T>(
  fetcher: (signal: AbortSignal) => Promise<T[]>,
  running: (items: T[]) => boolean,
  unavailable: string,
): { load: Load<T>; refetch: () => void } {
  const [load, setLoad] = useState<Load<T>>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetcher(controller.signal)
      .then((items) => {
        if (controller.signal.aborted) return;
        setLoad({ kind: 'ready', items });
        if (running(items)) timer = setTimeout(refetch, RUNNING_POLL_MS);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message: e instanceof StoreToolUnavailable ? unavailable : e instanceof Error ? e.message : String(e),
        });
      });
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
    // The fetcher and running test are module functions; only a refetch reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetches]);

  return { load, refetch };
}

/** Runs an action, says so when it fails, and reports whether it worked. */
export function useAction(): {
  busy: boolean;
  run: (fail: string, action: () => Promise<unknown>) => Promise<boolean>;
} {
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fail: string, action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (e) {
      toast({ variant: 'destructive', title: fail, description: e instanceof Error ? e.message : String(e) });
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, run };
}

export const when = (value: string | null | undefined) => (value ? new Date(value).toLocaleString() : '');
export const number = (n: number) => n.toLocaleString();
export const percentOf = (share: number) => `${Math.floor(share * 100)}%`;
