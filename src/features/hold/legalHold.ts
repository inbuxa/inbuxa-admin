/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:LegalHold` over JMAP (audit-hold-lock spec, LH-1 to
 * LH-14). A hold names a case and what it covers; its range and scope only
 * widen, releasing it is final, and it is never deleted. Every change says
 * why (AU-12). Only server administrators reach it (LH-13).
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';

const CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:LegalHold';

/** Fired on window after a hold changes, so every view of holds refreshes. */
export const HOLD_CHANGED = 'inbuxa:hold-changed';

export interface HoldScope {
  server: boolean;
  accounts: string[];
  groups: string[];
  domains: string[];
  tenants: string[];
}

export interface LegalHold {
  id: string;
  name: string;
  reference: string;
  description: string;
  scope: HoldScope;
  /** `yyyy-mm-dd`, UTC; empty for an open start. */
  from: string;
  /** `yyyy-mm-dd`, UTC; empty for an open end. */
  to: string;
  placedAt: string;
  placedBy: string;
  released: boolean;
  releasedAt: string | null;
  releasedBy: string | null;
  releaseReason: string | null;
  /** What it keeps (LH-9), when asked for. */
  accountsCovered?: number;
  itemsHeld?: number;
  sizeHeld?: number;
}

/** A hold's editable parts, as the form holds them. */
export interface HoldDraft {
  name: string;
  reference: string;
  description: string;
  scope: HoldScope;
  from: string;
  to: string;
}

export const EMPTY_SCOPE: HoldScope = { server: false, accounts: [], groups: [], domains: [], tenants: [] };

/** The server doesn't offer holds (an older server). */
export class HoldsUnavailable extends Error {
  constructor(reason: string) {
    super(`Legal holds unavailable: ${reason}`);
  }
}

function methodError(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new HoldsUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

function setError(result: unknown, bucket: string, key: string): Error | null {
  const failed = (result as Record<string, Record<string, { description?: string; type?: string }> | undefined>)[
    bucket
  ]?.[key];
  return failed ? new Error(failed.description ?? failed.type ?? 'Not saved') : null;
}

/** A day as the form holds it, as the start of that day in UTC. */
export function fromToServer(day: string): string | null {
  return day ? `${day}T00:00:00Z` : null;
}

/** A day as the form holds it, as the end of that day in UTC. */
export function toToServer(day: string): string | null {
  return day ? `${day}T23:59:59Z` : null;
}

/** A server date as the form's `yyyy-mm-dd`, UTC. */
export function dayFromServer(value: unknown): string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '';
}

const ids = (value: unknown): string[] => (Array.isArray(value) ? value.filter((v) => typeof v === 'string') : []);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const count = (value: unknown): number | undefined => (typeof value === 'number' ? value : undefined);

function fromServer(item: Record<string, unknown>): LegalHold {
  const scope = (item.scope ?? {}) as Record<string, unknown>;
  return {
    id: text(item.id),
    name: text(item.name),
    reference: text(item.reference),
    description: text(item.description),
    scope: {
      server: scope.server === true,
      accounts: ids(scope.accounts),
      groups: ids(scope.groups),
      domains: ids(scope.domains),
      tenants: ids(scope.tenants),
    },
    from: dayFromServer(item.from),
    to: dayFromServer(item.to),
    placedAt: text(item.placedAt),
    placedBy: text(item.placedBy),
    released: item.released === true,
    releasedAt: typeof item.releasedAt === 'string' ? item.releasedAt : null,
    releasedBy: typeof item.releasedBy === 'string' ? item.releasedBy : null,
    releaseReason: typeof item.releaseReason === 'string' ? item.releaseReason : null,
    accountsCovered: count(item.accountsCovered),
    itemsHeld: count(item.itemsHeld),
    sizeHeld: count(item.sizeHeld),
  };
}

const BASE_PROPERTIES = [
  'id',
  'name',
  'reference',
  'description',
  'scope',
  'from',
  'to',
  'placedAt',
  'placedBy',
  'released',
  'releasedAt',
  'releasedBy',
  'releaseReason',
];
const SUMMARY_PROPERTIES = ['accountsCovered', 'itemsHeld', 'sizeHeld'];

async function get(args: Record<string, unknown>, signal?: AbortSignal): Promise<LegalHold[]> {
  const responses = await jmapRequest(
    [[`${OBJECT}/get`, { accountId: getAccountId('x:Account'), ...args }, '0']],
    signal,
    [CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) throw methodError(name, result);
  return ((result as { list?: Record<string, unknown>[] }).list ?? []).map(fromServer);
}

/** Every hold, released ones included, with what each keeps (LH-9). */
export function fetchHolds(signal?: AbortSignal): Promise<LegalHold[]> {
  return get({ ids: null, properties: [...BASE_PROPERTIES, ...SUMMARY_PROPERTIES] }, signal);
}

/** The active holds covering one account, by any route (LH-14). */
export function fetchHoldsOn(accountId: string, signal?: AbortSignal): Promise<LegalHold[]> {
  return get({ coveringAccount: accountId, properties: ['id', 'name', 'reference'] }, signal);
}

function scopeToServer(scope: HoldScope): Record<string, unknown> {
  return {
    server: scope.server,
    accounts: scope.accounts,
    groups: scope.groups,
    domains: scope.domains,
    tenants: scope.tenants,
  };
}

function draftToServer(draft: HoldDraft): Record<string, unknown> {
  return {
    name: draft.name.trim(),
    reference: draft.reference.trim() || null,
    description: draft.description.trim() || null,
    scope: scopeToServer(draft.scope),
    from: fromToServer(draft.from),
    to: toToServer(draft.to),
  };
}

/** What's wrong with a draft before it's sent, or null. */
export function draftProblem(draft: HoldDraft): string | null {
  if (!draft.name.trim()) return 'Give the case a name.';
  const s = draft.scope;
  if (!s.server && !s.accounts.length && !s.groups.length && !s.domains.length && !s.tenants.length) {
    return 'Choose what the hold covers.';
  }
  if (draft.from && draft.to && draft.from > draft.to) return 'The range starts after it ends.';
  return null;
}

/**
 * What an edit would take away, which the server refuses (LH-3): a narrower
 * range or anything out of the scope. Checked here so the form can say so
 * before sending.
 */
export function narrowingProblem(current: LegalHold, draft: HoldDraft): string | null {
  const from = (old: string, next: string) => (old ? !!next && next > old : !!next);
  const to = (old: string, next: string) => (old ? !!next && next < old : !!next);
  if (from(current.from, draft.from) || to(current.to, draft.to)) {
    return 'The range can only be widened. To hold less, release this hold and place a new one.';
  }
  const kept = (old: string[], next: string[]) => old.every((id) => next.includes(id));
  const s = current.scope;
  const d = draft.scope;
  if (
    (s.server && !d.server) ||
    !kept(s.accounts, d.accounts) ||
    !kept(s.groups, d.groups) ||
    !kept(s.domains, d.domains) ||
    !kept(s.tenants, d.tenants)
  ) {
    return 'Nothing can be taken out of a hold. To hold less, release it and place a new one.';
  }
  return null;
}

async function set(args: Record<string, unknown>, bucket: string, key: string): Promise<string | undefined> {
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId: getAccountId('x:Account'), ...args }, '0']],
    undefined,
    [CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw methodError(name, result);
  const failed = setError(result, bucket, key);
  if (failed) throw failed;
  return (result as { created?: Record<string, { id?: string }> }).created?.[key]?.id;
}

export async function placeHold(draft: HoldDraft, reason: string): Promise<string | undefined> {
  return set({ create: { h: { ...draftToServer(draft), reason: reason.trim() } } }, 'notCreated', 'h');
}

export async function updateHold(id: string, draft: HoldDraft, reason: string): Promise<void> {
  await set({ reason: reason.trim(), update: { [id]: draftToServer(draft) } }, 'notUpdated', id);
}

export async function releaseHold(id: string, reason: string): Promise<void> {
  await set({ reason: reason.trim(), update: { [id]: { released: true } } }, 'notUpdated', id);
}

/** Bytes, as people read them. */
export function formatSize(bytes: number | undefined): string {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
