/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useState } from 'react';
import { fetchLocks, LOCK_CHANGED, type AccountLock } from './accountLock';

/** The account's lock, `null` when it isn't locked, `undefined` until known. */
export function useAccountLock(accountId: string, enabled: boolean) {
  const [lock, setLock] = useState<AccountLock | null | undefined>(undefined);
  const [fetches, setFetches] = useState(0);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    window.addEventListener(LOCK_CHANGED, refetch);
    return () => window.removeEventListener(LOCK_CHANGED, refetch);
  }, [refetch]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchLocks(accountId, controller.signal)
      .then((locks) => {
        if (!controller.signal.aborted) setLock(locks[0] ?? null);
      })
      // An older server without locks: say nothing
      .catch(() => undefined);
    return () => controller.abort();
  }, [accountId, enabled, fetches]);

  return lock;
}
