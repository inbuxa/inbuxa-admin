/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the deliverability check's server objects (deliverability spec):
 * one report per sending node, facts only, and which blocklists are left out.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { INBUXA_CAPABILITY } from '@/features/hardening/protocolPolicy';

export type ListingState = 'clean' | 'listed' | 'refused' | 'error' | 'off';

export interface Listing {
  list: string;
  state: ListingState;
  code?: string | null;
  meaning?: string | null;
}

export interface Address {
  ip: string;
  source: 'configured' | 'ehlo';
  strategy: string;
  ehlo: string;
  ptr: string[];
  forwardConfirmed: boolean;
  ehloMatches: boolean;
  ptrError?: string | null;
  listings: Listing[];
}

export interface DomainReport {
  domain: string;
  tenantId?: number | null;
  spf: { ip: string; result: string }[];
  dkim: { selector: string; state: 'matches' | 'missing' | 'different' | 'error' }[];
  dmarc?: { policy: string; adkim: string; aspf: string } | null;
  mtaSts: {
    recordId?: string | null;
    fetched: boolean;
    error?: string | null;
    mode?: string | null;
    maxAge?: number | null;
    mxNotCovered: string[];
  };
  tlsRpt: boolean;
  listings: Listing[];
}

export interface Report {
  id: string;
  nodeId: number;
  hostname: string;
  checkedAt: string;
  addresses: Address[];
  domains: DomainReport[];
  certificates: { name: string; covered: boolean }[];
}

export interface ListInfo {
  name: string;
  zone: string;
  scope: 'ip' | 'domain';
  lookup: string;
  note?: string | null;
}

export interface Settings {
  disabledLists: string[];
  lists: ListInfo[];
}

/** The server doesn't have the check (an older version). */
export class DeliverabilityUnavailable extends Error {}

async function call(method: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const responses = await jmapRequest([[method, { accountId: getAccountId('x:Domain'), ...args }, '0']], undefined, [
    INBUXA_CAPABILITY,
  ]);
  const [name, result] = responses[0] ?? [];
  if (name !== method) {
    const r = result as { type?: string; description?: string } | undefined;
    if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') throw new DeliverabilityUnavailable(r.type);
    throw new Error(r?.description ?? r?.type ?? 'Request failed');
  }
  return result as Record<string, unknown>;
}

export async function fetchReports(): Promise<Report[]> {
  const result = await call('inbuxa:DeliverabilityReport/get', { ids: null });
  return (result.list as Report[]) ?? [];
}

export async function fetchSettings(): Promise<Settings> {
  const result = await call('inbuxa:DeliverabilitySettings/get', { ids: null });
  const settings = (result.list as Settings[] | undefined)?.[0];
  return settings ?? { disabledLists: [], lists: [] };
}

export async function setDisabledLists(names: string[]): Promise<void> {
  const result = await call('inbuxa:DeliverabilitySettings/set', {
    update: { singleton: { disabledLists: names } },
  });
  const failed = (result.notUpdated as Record<string, { description?: string; type?: string }> | undefined)?.singleton;
  if (failed) throw new Error(failed.description ?? failed.type);
}

/**
 * DL-15: asks every node to check itself now. Returns at once with the
 * receiving node's id and when it last checked; the new report replaces
 * that one when the check is done.
 */
export async function checkNow(): Promise<{ id: string; checkedAt: string | null }> {
  const result = await call('inbuxa:DeliverabilityReport/set', { create: { now: {} } });
  const created = (result.created as Record<string, { id: string; checkedAt: string | null }> | undefined)?.now;
  if (!created) {
    const failed = (result.notCreated as Record<string, { description?: string }> | undefined)?.now;
    throw new Error(failed?.description ?? 'Not started');
  }
  return created;
}
