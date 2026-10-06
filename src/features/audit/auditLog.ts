/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the audit log over JMAP (audit-hold-lock spec, AU-9 to AU-11):
 * `inbuxa:AuditEvent`, `inbuxa:AuditSettings`, `inbuxa:AuditExport` and
 * `inbuxa:AuditVerification`. This module is the wire; the page draws from it.
 */

import { apiFetch } from '@/services/api';
import { fetchSession, getAccountId, jmapRequest } from '@/services/jmap/client';

export const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';
export const PAGE_SIZE = 50;

export type AuditAction =
  | 'create'
  | 'update'
  | 'destroy'
  | 'signIn'
  | 'signInFailed'
  | 'accountAccess'
  | 'blobAccess'
  | 'export'
  | 'verify';

export const AUDIT_ACTIONS: AuditAction[] = [
  'create',
  'update',
  'destroy',
  'signIn',
  'signInFailed',
  'accountAccess',
  'blobAccess',
  'export',
  'verify',
];

export interface AuditActor {
  accountId?: string;
  name: string;
  tenantId?: string;
}

export type AuditVia =
  | { kind: 'password' }
  | { kind: 'appPassword'; id: number }
  | { kind: 'apiKey'; id: number }
  | { kind: 'oauth'; client: string }
  | { kind: 'directory' }
  | { kind: 'master'; accountId?: string; name: string }
  | { kind: 'recovery' };

export interface AuditTarget {
  kind: string;
  id?: string;
  name?: string;
  accountId?: string;
  tenantId?: string;
}

export interface AuditChange {
  field: string;
  before?: unknown;
  after?: unknown;
  redacted?: boolean;
}

export type AuditOutcome =
  | { status: 'success'; createdId?: string }
  | { status: 'refused'; error: string; description?: string }
  | { status: 'pending' };

export interface AuditEvent {
  id: string;
  /** RFC 3339, to the millisecond. */
  at: string;
  node: number;
  actor: AuditActor;
  via: AuditVia | null;
  remoteIp: string | null;
  action: AuditAction;
  target: AuditTarget;
  changes: AuditChange[];
  details: string | null;
  reason: string | null;
  outcome: AuditOutcome;
}

/** What the page filters by. Empty strings mean "any". */
export interface AuditFilterInput {
  /** `yyyy-mm-dd`, local day, inclusive. */
  from: string;
  /** `yyyy-mm-dd`, local day, inclusive. */
  to: string;
  action: AuditAction | '';
  outcome: 'success' | 'refused' | 'pending' | '';
  targetKind: string;
  text: string;
}

export const EMPTY_FILTER: AuditFilterInput = {
  from: '',
  to: '',
  action: '',
  outcome: '',
  targetKind: '',
  text: '',
};

/** The server's filter object: every condition must hold. */
export function toServerFilter(input: AuditFilterInput): Record<string, string> {
  const filter: Record<string, string> = {};
  if (input.from) filter.after = localDayStart(input.from).toISOString().replace(/\.\d{3}Z$/, 'Z');
  if (input.to) {
    const end = localDayStart(input.to);
    end.setDate(end.getDate() + 1);
    filter.before = end.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  if (input.action) filter.action = input.action;
  if (input.outcome) filter.outcome = input.outcome;
  if (input.targetKind.trim()) filter.targetKind = input.targetKind.trim();
  if (input.text.trim()) filter.text = input.text.trim();
  return filter;
}

function localDayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function methodError(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') {
    return new AuditUnavailable(r.type);
  }
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

/** The server doesn't offer the audit log (an older server, or not inbuxa). */
export class AuditUnavailable extends Error {
  constructor(reason: string) {
    super(`Audit log unavailable: ${reason}`);
  }
}

export interface AuditPage {
  events: AuditEvent[];
  total: number;
}

/** One page of events, newest first. */
export async function queryEvents(
  input: AuditFilterInput,
  position: number,
  signal?: AbortSignal,
): Promise<AuditPage> {
  const accountId = getAccountId('x:Account');
  const responses = await jmapRequest(
    [
      [
        'inbuxa:AuditEvent/query',
        { accountId, filter: toServerFilter(input), position, limit: PAGE_SIZE, calculateTotal: true },
        'q',
      ],
      [
        'inbuxa:AuditEvent/get',
        { accountId, '#ids': { resultOf: 'q', name: 'inbuxa:AuditEvent/query', path: '/ids' } },
        'g',
      ],
    ],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [qName, qResult] = responses[0] ?? [];
  if (qName !== 'inbuxa:AuditEvent/query') throw methodError(qName, qResult);
  const [gName, gResult] = responses[1] ?? [];
  if (gName !== 'inbuxa:AuditEvent/get') throw methodError(gName, gResult);
  const ids = (qResult as { ids?: string[] }).ids ?? [];
  const byId = new Map(((gResult as { list?: AuditEvent[] }).list ?? []).map((e) => [e.id, normalize(e)]));
  return {
    // Keep the query's order: newest first
    events: ids.map((id) => byId.get(id)).filter((e): e is AuditEvent => !!e),
    total: (qResult as { total?: number }).total ?? ids.length,
  };
}

/** Fills what the server leaves out when it has nothing to say. */
export function normalize(raw: Partial<AuditEvent> & { id: string }): AuditEvent {
  return {
    id: raw.id,
    at: raw.at ?? '',
    node: raw.node ?? 0,
    actor: raw.actor ?? { name: '' },
    via: raw.via ?? null,
    remoteIp: raw.remoteIp ?? null,
    action: (raw.action ?? 'update') as AuditAction,
    target: raw.target ?? { kind: '' },
    changes: raw.changes ?? [],
    details: raw.details ?? null,
    reason: raw.reason ?? null,
    outcome: raw.outcome ?? { status: 'pending' },
  };
}

export async function fetchKeepForDays(): Promise<number> {
  const accountId = getAccountId('x:Account');
  const responses = await jmapRequest(
    [['inbuxa:AuditSettings/get', { accountId, ids: null }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== 'inbuxa:AuditSettings/get') throw methodError(name, result);
  return (result as { list?: { keepForDays?: number }[] }).list?.[0]?.keepForDays ?? 730;
}

export async function updateKeepForDays(days: number): Promise<void> {
  const accountId = getAccountId('x:Account');
  const responses = await jmapRequest(
    [['inbuxa:AuditSettings/set', { accountId, update: { singleton: { keepForDays: days } } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== 'inbuxa:AuditSettings/set') throw methodError(name, result);
  const failed = (result as { notUpdated?: Record<string, { description?: string; type?: string }> }).notUpdated
    ?.singleton;
  if (failed) throw new Error(failed.description ?? failed.type ?? 'Not saved');
}

export interface ExportResult {
  count: number;
  sha256: string;
}

/** Asks the server for a file of the matching records, and saves it (AU-11). */
export async function exportEvents(
  input: AuditFilterInput,
  format: 'csv' | 'jsonl',
  reason: string,
): Promise<ExportResult> {
  const accountId = getAccountId('x:Account');
  const create: Record<string, unknown> = { format, filter: toServerFilter(input) };
  if (reason.trim()) create.reason = reason.trim();
  const responses = await jmapRequest(
    [['inbuxa:AuditExport/set', { accountId, create: { x: create } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== 'inbuxa:AuditExport/set') throw methodError(name, result);
  const r = result as {
    created?: { x?: { blobId: string; count: number; sha256: string } };
    notCreated?: { x?: { description?: string; type?: string } };
  };
  const created = r.created?.x;
  if (!created) throw new Error(r.notCreated?.x?.description ?? r.notCreated?.x?.type ?? 'Export failed');

  const fileName = `audit-${new Date().toISOString().slice(0, 10)}.${format === 'csv' ? 'csv' : 'jsonl'}`;
  const type = format === 'csv' ? 'text/csv' : 'application/jsonl';
  const session = await fetchSession();
  const template =
    typeof session.downloadUrl === 'string'
      ? session.downloadUrl
      : '/jmap/download/{accountId}/{blobId}/{name}?accept={type}';
  const url = template
    .replace('{accountId}', encodeURIComponent(accountId))
    .replace('{blobId}', encodeURIComponent(created.blobId))
    .replace('{name}', encodeURIComponent(fileName))
    .replace('{type}', encodeURIComponent(type));
  const response = await apiFetch(pathOf(url));
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  saveBlob(await response.blob(), fileName);
  return { count: created.count, sha256: created.sha256 };
}

function pathOf(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder');
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

export interface ChainReport {
  node: number;
  entries: number;
  firstSeq: number;
  lastSeq: number;
  brokenAt?: string;
  reason?: string;
  unfinished: number;
}

export interface Verification {
  verified: boolean;
  chains: ChainReport[];
}

/** Rechecks every node's chain (AU-6). Server administrators only. */
export async function verifyChains(): Promise<Verification> {
  const accountId = getAccountId('x:Account');
  const responses = await jmapRequest(
    [['inbuxa:AuditVerification/set', { accountId, create: { v: {} } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== 'inbuxa:AuditVerification/set') throw methodError(name, result);
  const created = (result as { created?: { v?: Verification } }).created?.v;
  if (!created) throw new Error('Verification failed');
  return { verified: created.verified, chains: created.chains ?? [] };
}
