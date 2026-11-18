/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { getAccountId, jmapQueryAndGet } from '@/services/jmap/client';
import { checkRecordValues } from './liveCheck';
import { isDone, recordStates, type RecordState } from './recordState';
import type { ZoneRecord } from './zone';

export interface DnsTask {
  id: string;
  '@type': string;
  domainId?: string;
  status?: { '@type': string; failureReason?: string };
}

const POLL_MS = 8000;
const GIVE_UP_MS = 10 * 60_000;

/**
 * Keep checking a set of records in public DNS, every few seconds for ten
 * minutes, and (for automatic DNS) the server's publishing task for the
 * domain. `task` is undefined until first read, null when none is queued.
 */
export function useRecordChecks(records: ZoneRecord[], domainId: string, watchTask: boolean) {
  const [states, setStates] = useState<Map<ZoneRecord, RecordState>>(new Map());
  const [task, setTask] = useState<DnsTask | null | undefined>(undefined);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const started = useRef<number | null>(null);

  const check = useCallback(async () => {
    setChecking(true);
    if (watchTask) {
      try {
        const [, getRes] = await jmapQueryAndGet('x:Task', getAccountId('x:Task'), {}, ['@type', 'domainId', 'status']);
        const list = ((getRes?.[1] as { list?: DnsTask[] })?.list ?? []).filter(
          (x) => x['@type'] === 'DnsManagement' && x.domainId === domainId,
        );
        setTask(list[0] ?? null);
      } catch {
        setTask(null);
      }
    }
    setStates(recordStates(records, await checkRecordValues(records)));
    setLastChecked(new Date());
    setChecking(false);
  }, [domainId, records, watchTask]);

  useEffect(() => {
    // Checking DNS and the task list syncs with outside systems, so state
    // lands from their callbacks, never synchronously in the effect.
    const first = setTimeout(() => {
      started.current = Date.now();
      void check();
    }, 0);
    const timer = setInterval(() => {
      if (started.current !== null && Date.now() - started.current > GIVE_UP_MS) return;
      void check();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [check]);

  // A valid DMARC or SPF of the domain's own counts as done (#239).
  const liveCount = records.filter((r) => isDone(states.get(r))).length;
  return {
    states,
    task,
    checking,
    lastChecked,
    check,
    liveCount,
    allLive: records.length > 0 && liveCount === records.length,
  };
}
