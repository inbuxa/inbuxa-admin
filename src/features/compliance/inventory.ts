/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:DataInventory` and `inbuxa:InventorySnapshot`, the
 * personal-data catalog evaluated against this server, and its history
 * (personal-data catalog spec, §6, §8). Facts only: what is held, where,
 * for how long, and which hosts receive it.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';

const CAPABILITY = 'urn:inbuxa:jmap';

export type Retention =
  | { kind: 'days'; days: number; setting?: string }
  | { kind: 'unbounded'; setting?: string }
  | { kind: 'object-life' }
  | { kind: 'receiver' }
  | { kind: 'setting'; setting: string };

export interface InventoryItem {
  id: string;
  kind: 'object' | 'source';
  categories: string[];
  whose: string[];
  where: string[];
  scope: 'tenant' | 'server';
  collected: boolean;
  retention: Retention;
  leavesHost: boolean;
  controlledBy: string[];
  endpoints: string[];
}

export interface Processor {
  host: string;
  receives: string[];
  sources: string[];
}

export interface Summary {
  collected: number;
  unbounded: number;
  leavingHost: number;
  processors: number;
}

export interface Inventory {
  evaluatedAt: string;
  catalogVersion: string;
  summary: Summary;
  items: InventoryItem[];
  processors: Processor[];
}

export interface Snapshot {
  id: string;
  takenAt: string;
  trigger: { kind: 'settingChanged'; setting: string } | { kind: 'daily' };
  summary: Summary;
}

/** The server doesn't evaluate the catalog (an older server). */
export class InventoryUnavailable extends Error {}

function failure(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new InventoryUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

const EMPTY_SUMMARY: Summary = { collected: 0, unbounded: 0, leavingHost: 0, processors: 0 };

export async function fetchInventory(signal?: AbortSignal): Promise<Inventory> {
  const responses = await jmapRequest(
    [['inbuxa:DataInventory/get', { accountId: getAccountId('x:Account'), ids: null }, '0']],
    signal,
    [CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== 'inbuxa:DataInventory/get') throw failure(name, result);
  const raw = ((result as { list?: Record<string, unknown>[] }).list ?? [])[0] ?? {};
  return {
    evaluatedAt: String(raw.evaluatedAt ?? ''),
    catalogVersion: String(raw.catalogVersion ?? ''),
    summary: { ...EMPTY_SUMMARY, ...((raw.summary as Summary | undefined) ?? {}) },
    items: (raw.items as InventoryItem[] | undefined) ?? [],
    processors: (raw.processors as Processor[] | undefined) ?? [],
  };
}

/** Every snapshot kept, newest first, without their inventories. */
export async function fetchSnapshots(signal?: AbortSignal): Promise<Snapshot[]> {
  const responses = await jmapRequest(
    [
      [
        'inbuxa:InventorySnapshot/get',
        { accountId: getAccountId('x:Account'), ids: null, properties: ['id', 'takenAt', 'trigger', 'summary'] },
        '0',
      ],
    ],
    signal,
    [CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== 'inbuxa:InventorySnapshot/get') throw failure(name, result);
  return ((result as { list?: Snapshot[] }).list ?? []).map((s) => ({
    ...s,
    summary: { ...EMPTY_SUMMARY, ...(s.summary ?? {}) },
  }));
}

const SOURCE_NAMES: Record<string, string> = {
  'mail-and-groupware': 'Mail, calendars, contacts and files',
  'full-text-index': 'Search index',
  'trace-index': 'Delivery history search index',
  'log-file': 'Log files',
  'console-and-journal': 'Console and system journal output',
  'otel-tracer': 'OpenTelemetry export',
  webhooks: 'Webhooks',
  'spam-trainer-state': 'Spam classifier training state',
  'spam-llm': 'AI spam classification',
  'explain-cache': 'Explain answers (in memory)',
  'spam-dnsbl': 'Blocklist lookups',
  'spam-pyzor': 'Pyzor lookups',
  'spam-url-redirects': 'Short-link lookups',
  'mta-milter-and-hooks': 'Milters and MTA hooks',
  relay: 'Relay (smart host)',
  'push-subscriptions': 'Push subscriptions',
  'rate-limit-and-greylist': 'Rate limits and greylisting',
  'legacy-last-use': 'Legacy mail app last use',
  'masked-address-records': 'Masked address records',
  'outbound-reports': 'DMARC and TLS reports sent',
};

/** Words in object names that are written in capitals. */
const ACRONYMS: Record<string, string> = Object.fromEntries(
  [
    'AI',
    'API',
    'ARF',
    'ASN',
    'CSV',
    'DAV',
    'DKIM',
    'DMARC',
    'DNS',
    'DNSBL',
    'DSN',
    'EHLO',
    'HTTP',
    'IMAP',
    'IP',
    'JMAP',
    'LDAP',
    'LLM',
    'MTA',
    'MX',
    'OIDC',
    'OTP',
    'SPF',
    'SQL',
    'STS',
    'TLS',
    'TSIG',
    'TTL',
    'URL',
  ].map((a) => [a.toLowerCase(), a]),
);

/** A readable name for a catalog id. */
export function itemName(id: string): string {
  if (SOURCE_NAMES[id]) return SOURCE_NAMES[id];
  const bare = id.replace(/^(x|inbuxa):/, '');
  // BlockedIp -> Blocked IP
  const words = bare
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
    .split(' ')
    .map((w, i) => ACRONYMS[w.toLowerCase()] ?? (i === 0 ? w : w.toLowerCase()));
  return words.join(' ');
}

const WHERE_NAMES: Record<string, string> = {
  'data-store': 'data store',
  'blob-store': 'blob store',
  'search-store': 'search store',
  'in-memory-store': 'in-memory store',
  memory: 'memory',
  'log-file': 'log files',
  external: 'sent elsewhere',
};

export function whereName(where: string): string {
  return WHERE_NAMES[where] ?? where;
}

/** A retention as a fact, in words. */
export function retentionText(retention: Retention): string {
  switch (retention.kind) {
    case 'days':
      return retention.days === 1 ? 'Kept 1 day' : `Kept ${retention.days} days`;
    case 'unbounded':
      return 'Kept with no limit';
    case 'object-life':
      return 'Kept while it exists';
    case 'receiver':
      return 'Kept by whoever receives it';
    case 'setting':
      return `Set by ${retention.setting}`;
  }
}

export interface InventoryFilter {
  kind: '' | 'object' | 'source';
  category: string;
  where: string;
  onlyCollected: boolean;
}

export const EMPTY_INVENTORY_FILTER: InventoryFilter = { kind: '', category: '', where: '', onlyCollected: true };

export function filterItems(items: InventoryItem[], filter: InventoryFilter): InventoryItem[] {
  return items.filter(
    (item) =>
      (!filter.kind || item.kind === filter.kind) &&
      (!filter.category || item.categories.includes(filter.category)) &&
      (!filter.where || item.where.includes(filter.where) || (filter.where === 'external' && item.leavesHost)) &&
      (!filter.onlyCollected || item.collected),
  );
}

/** Collected items kept with no limit, for the Overview. */
export function unboundedItems(items: InventoryItem[]): InventoryItem[] {
  return items.filter((i) => i.collected && i.retention.kind === 'unbounded');
}
