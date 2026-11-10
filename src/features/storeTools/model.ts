/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the store's own tools as the server sends them (inbuxa-server
 * docs/spec/features/store-check.md, store-snapshot.md,
 * blob-store-change.md): `inbuxa:StoreCheck`, `inbuxa:StoreSnapshot` and
 * `inbuxa:BlobStoreChange`.
 */

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const share = (v: unknown): number => Math.min(1, Math.max(0, count(v)));
const list = (v: unknown): Record<string, unknown>[] =>
  Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : [];
const oneOf = <T extends string>(v: unknown, values: readonly T[], fallback: T): T =>
  values.includes(v as T) ? (v as T) : fallback;

// ── Store check (SV-1 to SV-10) ──

export const CHECK_STATUSES = ['running', 'done', 'stopped', 'failed', 'interrupted'] as const;
export type CheckStatus = (typeof CHECK_STATUSES)[number];
export type CheckMode = 'quick' | 'full';
export type CheckProblemKind = 'missing' | 'damaged' | 'unlinked' | 'unreadable';

export interface CheckProblem {
  kind: CheckProblemKind;
  accountId: string | null;
  accountName: string;
  object: string;
  objectId: string;
  blobId: string;
  committed: boolean;
  detail: string;
}

export interface StoreCheck {
  id: string;
  mode: CheckMode;
  status: CheckStatus;
  createdAt: string;
  finishedAt: string | null;
  createdBy: string;
  node: string;
  progress: number;
  blobsPerSecond: number;
  bytesPerSecond: number;
  blobsChecked: number;
  linksChecked: number;
  bytesRead: number;
  messagesChecked: number;
  missing: number;
  damaged: number;
  unlinked: number;
  unreadable: number;
  problems: CheckProblem[];
  error: string | null;
}

export function checkFromServer(item: Record<string, unknown>): StoreCheck {
  return {
    id: String(item.id),
    mode: item.mode === 'full' ? 'full' : 'quick',
    status: oneOf(item.status, CHECK_STATUSES, 'running'),
    createdAt: text(item.createdAt) ?? '',
    finishedAt: text(item.finishedAt),
    createdBy: text(item.createdBy) ?? '',
    node: text(item.node) ?? '',
    progress: share(item.progress),
    blobsPerSecond: count(item.blobsPerSecond),
    bytesPerSecond: count(item.bytesPerSecond),
    blobsChecked: count(item.blobsChecked),
    linksChecked: count(item.linksChecked),
    bytesRead: count(item.bytesRead),
    messagesChecked: count(item.messagesChecked),
    missing: count(item.missing),
    damaged: count(item.damaged),
    unlinked: count(item.unlinked),
    unreadable: count(item.unreadable),
    problems: list(item.problems).map((p) => ({
      kind: oneOf(p.kind, ['missing', 'damaged', 'unlinked', 'unreadable'] as const, 'missing'),
      accountId: p.accountId == null ? null : String(p.accountId),
      accountName: text(p.accountName) ?? '',
      object: p.object == null ? '' : String(p.object),
      objectId: p.objectId == null ? '' : String(p.objectId),
      blobId: text(p.blobId) ?? '',
      committed: p.committed === true,
      detail: text(p.detail) ?? '',
    })),
    error: text(item.error),
  };
}

/** Problems of every kind a check found, past the 1,000 it keeps too (SV-5). */
export const checkProblemCount = (c: StoreCheck) => c.missing + c.damaged + c.unlinked + c.unreadable;

// ── Store snapshot (SN-1 to SN-10) ──

export type SnapshotStatus = 'running' | 'done' | 'failed';

export interface StoreSnapshot {
  id: string;
  status: SnapshotStatus;
  createdAt: string;
  finishedAt: string | null;
  createdBy: string;
  node: string;
  name: string;
  path: string;
  holds: string[];
  size: number;
  blobFiles: number;
  error: string | null;
}

export function snapshotFromServer(item: Record<string, unknown>): StoreSnapshot {
  return {
    id: String(item.id),
    status: oneOf(item.status, ['running', 'done', 'failed'] as const, 'running'),
    createdAt: text(item.createdAt) ?? '',
    finishedAt: text(item.finishedAt),
    createdBy: text(item.createdBy) ?? '',
    node: text(item.node) ?? '',
    name: text(item.name) ?? '',
    path: text(item.path) ?? '',
    holds: Array.isArray(item.holds) ? item.holds.map(String) : [],
    size: count(item.size),
    blobFiles: count(item.blobFiles),
    error: text(item.error),
  };
}

// ── Blob store change (BM-1 to BM-10) ──

export const CHANGE_STATUSES = [
  'pending',
  'copying',
  'copied',
  'incomplete',
  'stopped',
  'failed',
  'interrupted',
  'reverted',
] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export type ChangeProblemKind = 'missing' | 'damaged' | 'unreadable';

export interface ChangeProblem {
  kind: ChangeProblemKind;
  blobId: string;
  holder: string;
  accountId: string | null;
  objectId: string | null;
  detail: string;
}

/** CA-5: what the copy ahead did, kept when a planned change became the change. */
export interface CopiedAhead {
  startedAt: string;
  finishedAt: string | null;
  status: ChangeStatus;
  copied: number;
  alreadyThere: number;
  bytesCopied: number;
  problems: number;
}

export interface BlobStoreChange {
  id: string;
  /** CA-1: `planned` until the setting moves to it; changes from before 27.1-rc.18 are `changed`. */
  stage: 'planned' | 'changed';
  from: string;
  to: string;
  /** Null while planned. */
  changedAt: string | null;
  node: string | null;
  status: ChangeStatus;
  copyStartedAt: string | null;
  copyFinishedAt: string | null;
  copyStartedBy: string | null;
  copyNode: string | null;
  blobsPerSecond: number;
  bytesPerSecond: number;
  progress: number;
  blobsChecked: number;
  copied: number;
  alreadyThere: number;
  bytesCopied: number;
  missing: number;
  damaged: number;
  unreadable: number;
  problems: ChangeProblem[];
  error: string | null;
  copiedAhead: CopiedAhead | null;
  appliedAt: string | null;
  appliedBy: string | null;
}

function copiedAheadFromServer(v: unknown): CopiedAhead | null {
  if (!v || typeof v !== 'object') return null;
  const a = v as Record<string, unknown>;
  return {
    startedAt: text(a.startedAt) ?? '',
    finishedAt: text(a.finishedAt),
    status: oneOf(a.status, CHANGE_STATUSES, 'pending'),
    copied: count(a.copied),
    alreadyThere: count(a.alreadyThere),
    bytesCopied: count(a.bytesCopied),
    problems: count(a.problems),
  };
}

export function changeFromServer(item: Record<string, unknown>): BlobStoreChange {
  return {
    id: String(item.id),
    stage: item.stage === 'planned' ? 'planned' : 'changed',
    from: text(item.from) ?? '',
    to: text(item.to) ?? '',
    changedAt: text(item.changedAt),
    node: text(item.node),
    status: oneOf(item.status, CHANGE_STATUSES, 'pending'),
    copyStartedAt: text(item.copyStartedAt),
    copyFinishedAt: text(item.copyFinishedAt),
    copyStartedBy: text(item.copyStartedBy),
    copyNode: text(item.copyNode),
    blobsPerSecond: count(item.blobsPerSecond),
    bytesPerSecond: count(item.bytesPerSecond),
    progress: share(item.progress),
    blobsChecked: count(item.blobsChecked),
    copied: count(item.copied),
    alreadyThere: count(item.alreadyThere),
    bytesCopied: count(item.bytesCopied),
    missing: count(item.missing),
    damaged: count(item.damaged),
    unreadable: count(item.unreadable),
    problems: list(item.problems).map((p) => ({
      kind: oneOf(p.kind, ['missing', 'damaged', 'unreadable'] as const, 'missing'),
      blobId: text(p.blobId) ?? '',
      holder: text(p.holder) ?? '',
      accountId: p.accountId == null ? null : String(p.accountId),
      objectId: p.objectId == null ? null : String(p.objectId),
      detail: text(p.detail) ?? '',
    })),
    error: text(item.error),
    copiedAhead: copiedAheadFromServer(item.copiedAhead),
    appliedAt: text(item.appliedAt),
    appliedBy: text(item.appliedBy),
  };
}

export const isPlanned = (c: BlobStoreChange) => c.stage === 'planned';

/** BM-3: the server still reads through to the old store. A planned change isn't read through (CA-3). */
export const isUnresolved = (c: BlobStoreChange) => !isPlanned(c) && c.status !== 'copied' && c.status !== 'reverted';

/** What may be done to a change now (BM-5 to BM-7, CA-2, CA-7, CA-8). */
export function changeActions(c: BlobStoreChange): { copy: boolean; stop: boolean; dismiss: boolean; apply: boolean } {
  const copying = c.status === 'copying';
  const planned = isPlanned(c);
  return {
    copy: !copying && (planned || isUnresolved(c)),
    stop: copying,
    dismiss: !copying,
    apply: planned && c.status === 'copied' && !c.appliedAt,
  };
}

/** CA-1: why a change can't be planned now, or null when one can. */
export function planBlocked(changes: BlobStoreChange[]): 'planned' | 'unresolved' | null {
  if (changes.some(isPlanned)) return 'planned';
  if (changes.some(isUnresolved)) return 'unresolved';
  return null;
}

/** A limit as sent: a whole number of at least 0, or null for the server's default (SV-6, BM-5). */
export function parseLimit(value: string): number | null | 'invalid' {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return 'invalid';
  return Number(trimmed);
}

/** Newest first, by an ISO date. */
export const newestFirst = <T>(items: T[], date: (item: T) => string) =>
  [...items].sort((a, b) => date(b).localeCompare(date(a)));
