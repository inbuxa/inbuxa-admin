/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * What the dashboard can know from the server's ordinary objects, with no
 * metrics at all: how many people, domains, queued messages, blocked
 * addresses, failed tasks and reports there are, who uses how much storage,
 * and where queued mail is stuck. One JMAP request, refreshed every minute.
 * A query the viewer isn't allowed to run just leaves that fact out.
 */
import { useCallback, useEffect, useState } from 'react';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapMethodCall } from '@/types/jmap';

export interface StorageUse {
  id: string;
  name: string;
  used: number;
  /** The account's disk quota in bytes, when it has one. */
  quota: number | null;
}

export type RecipientState = 'Scheduled' | 'TemporaryFailure' | 'PermanentFailure' | 'Completed';

export interface WaitingDomain {
  domain: string;
  scheduled: number;
  retrying: number;
  failed: number;
}

export interface ServerFacts {
  users?: number;
  groups?: number;
  domains?: number;
  queued?: number;
  blockedIps?: number;
  failedTasks?: number;
  dmarcReports?: number;
  tlsReports?: number;
  storage?: StorageUse[];
  waiting?: WaitingDomain[];
  /** Messages with at least one recipient in temporary failure. */
  retrying?: number;
}

const COUNTS: [keyof ServerFacts, string, Record<string, unknown>?][] = [
  ['users', 'x:Account', { '@type': 'User' }],
  ['groups', 'x:Account', { '@type': 'Group' }],
  ['domains', 'x:Domain'],
  ['queued', 'x:QueuedMessage'],
  ['blockedIps', 'x:BlockedIp'],
  ['failedTasks', 'x:Task', { status: 'Failed' }],
  ['dmarcReports', 'x:DmarcExternalReport'],
  ['tlsReports', 'x:TlsExternalReport'],
];

const DETAIL_LIMIT = 250;

function quotaOf(quotas: unknown): number | null {
  if (!quotas || typeof quotas !== 'object') return null;
  const q = quotas as Record<string, unknown>;
  const disk = q.maxDiskQuota ?? q.diskQuota ?? q.disk;
  return typeof disk === 'number' && disk > 0 ? disk : null;
}

interface QueuedRow {
  recipients?: Record<string, { status?: { '@type'?: string } }>;
}

export function summarizeQueue(list: QueuedRow[]): { waiting: WaitingDomain[]; retrying: number } {
  const byDomain = new Map<string, WaitingDomain>();
  let retrying = 0;
  for (const m of list) {
    let anyRetry = false;
    for (const [addr, r] of Object.entries(m.recipients ?? {})) {
      const state = (r.status?.['@type'] ?? 'Scheduled') as RecipientState;
      if (state === 'Completed') continue;
      const domain = addr.split('@')[1]?.toLowerCase() ?? addr;
      const row = byDomain.get(domain) ?? { domain, scheduled: 0, retrying: 0, failed: 0 };
      if (state === 'TemporaryFailure') {
        row.retrying++;
        anyRetry = true;
      } else if (state === 'PermanentFailure') row.failed++;
      else row.scheduled++;
      byDomain.set(domain, row);
    }
    if (anyRetry) retrying++;
  }
  const waiting = [...byDomain.values()].sort(
    (a, b) => b.scheduled + b.retrying + b.failed - (a.scheduled + a.retrying + a.failed),
  );
  return { waiting, retrying };
}

async function fetchFacts(): Promise<ServerFacts> {
  const calls: JmapMethodCall[] = [];
  const accountFor = (obj: string) => {
    try {
      return getAccountId(obj);
    } catch {
      return null;
    }
  };
  COUNTS.forEach(([key, obj, filter]) => {
    const accountId = accountFor(obj);
    if (!accountId) return;
    calls.push([`${obj}/query`, { accountId, filter, limit: 1, calculateTotal: true }, `c:${key}`]);
  });
  const accountAcct = accountFor('x:Account');
  if (accountAcct) {
    calls.push([
      'x:Account/query',
      { accountId: accountAcct, filter: { '@type': 'User' }, limit: DETAIL_LIMIT },
      'q:storage',
    ]);
    calls.push([
      'x:Account/get',
      {
        accountId: accountAcct,
        '#ids': { resultOf: 'q:storage', name: 'x:Account/query', path: '/ids' },
        properties: ['emailAddress', 'name', 'usedDiskQuota', 'quotas'],
      },
      'g:storage',
    ]);
  }
  const queueAcct = accountFor('x:QueuedMessage');
  if (queueAcct) {
    calls.push(['x:QueuedMessage/query', { accountId: queueAcct, limit: DETAIL_LIMIT }, 'q:queue']);
    calls.push([
      'x:QueuedMessage/get',
      {
        accountId: queueAcct,
        '#ids': { resultOf: 'q:queue', name: 'x:QueuedMessage/query', path: '/ids' },
        properties: ['recipients'],
      },
      'g:queue',
    ]);
  }

  const responses = await jmapRequest(calls);
  const facts: ServerFacts = {};
  for (const [name, body, tag] of responses) {
    if (name === 'error') continue;
    const b = body as Record<string, unknown>;
    if (tag.startsWith('c:') && typeof b.total === 'number') {
      (facts as Record<string, unknown>)[tag.slice(2)] = b.total;
    } else if (tag === 'g:storage') {
      facts.storage = ((b.list as Record<string, unknown>[]) ?? []).map((a) => ({
        id: String(a.id),
        name: String(a.emailAddress ?? a.name ?? a.id),
        used: typeof a.usedDiskQuota === 'number' ? a.usedDiskQuota : 0,
        quota: quotaOf(a.quotas),
      }));
    } else if (tag === 'g:queue') {
      Object.assign(facts, summarizeQueue((b.list as QueuedRow[]) ?? []));
    }
  }
  return facts;
}

const REFRESH_MS = 60_000;

export function useServerFacts() {
  const [facts, setFacts] = useState<ServerFacts | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    fetchFacts()
      .then((f) => {
        setFacts(f);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    // Fetching syncs with the server; state lands from the promise, not here.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh]);

  return { facts, error, refresh };
}
