/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:AccountLock` over JMAP (audit-hold-lock spec, AL-1 to
 * AL-12): an account locked, and the people it is handed to. A lock's id is
 * the locked account's id. Every change says why (AU-12).
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';

export const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';

/** Fired on window after a lock or unlock, so every view of it refreshes. */
export const LOCK_CHANGED = 'inbuxa:lock-changed';
const OBJECT = 'inbuxa:AccountLock';

export type Access = 'read' | 'organize' | 'full';

/**
 * What a lock is for (multi-account spec, MA-S): a locked account, or a shared
 * mailbox such as support@. A shared mailbox needs no reason, holds up to 100
 * people, and runs its own automatic replies.
 */
export type LockKind = 'lock' | 'sharedMailbox';

/** Most people a lock of this kind may have. */
export function maxDelegates(kind: LockKind): number {
  return kind === 'sharedMailbox' ? 100 : 10;
}

export const ACCESS_LEVELS: Access[] = ['read', 'organize', 'full'];

export interface Delegate {
  accountId: string;
  name?: string;
  access: Access;
  sendAs: boolean;
  /** `yyyy-mm-dd`, the last day, local; empty for no end. */
  until: string;
}

export interface AccountLock {
  id: string;
  name: string;
  kind: LockKind;
  reason: string;
  /** RFC 3339. */
  lockedAt: string;
  lockedBy: string;
  delegates: Delegate[];
}

/** The server doesn't offer account locks (an older server). */
export class LocksUnavailable extends Error {
  constructor(reason: string) {
    super(`Account locks unavailable: ${reason}`);
  }
}

function methodError(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new LocksUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

function setError(result: unknown, bucket: string, key: string): Error | null {
  const failed = (result as Record<string, Record<string, { description?: string; type?: string }> | undefined>)[
    bucket
  ]?.[key];
  return failed ? new Error(failed.description ?? failed.type ?? 'Not saved') : null;
}

/** A day entered in the form, as the end of that day in UTC for the server. */
export function untilToServer(day: string): string | null {
  if (!day) return null;
  const [y, m, d] = day.split('-').map(Number);
  const end = new Date(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59);
  return end.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A server date as the form's `yyyy-mm-dd`, local. */
export function untilFromServer(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** What's wrong with a delegate list before it's sent, or null (AL-5, AL-8). */
export function delegateProblem(delegates: Delegate[], lockedId: string, kind: LockKind = 'lock'): string | null {
  const max = maxDelegates(kind);
  // A shared mailbox's delegates are just the people in it (MA-S4)
  const who = kind === 'sharedMailbox' ? 'person' : 'delegate';
  if (delegates.length > max) return `At most ${max} ${who === 'person' ? 'people' : 'delegates'}.`;
  const seen = new Set<string>();
  for (const d of delegates) {
    if (!d.accountId) return `Choose an account for each ${who}.`;
    if (d.accountId === lockedId)
      return kind === 'sharedMailbox' ? 'A shared mailbox can’t have itself as a person.' : 'An account can’t be its own delegate.';
    if (seen.has(d.accountId)) return `A ${who} is listed twice.`;
    seen.add(d.accountId);
    if (d.sendAs && d.access === 'read')
      return 'Sending as the account needs organize or full access: the message is made in its Drafts first.';
  }
  return null;
}

function toServer(delegates: Delegate[]) {
  return delegates.map((d) => ({
    accountId: d.accountId,
    access: d.access,
    sendAs: d.sendAs,
    until: untilToServer(d.until),
  }));
}

function fromServer(raw: Record<string, unknown>): AccountLock {
  const delegates = Array.isArray(raw.delegates) ? (raw.delegates as Record<string, unknown>[]) : [];
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    // An older server sends no kind: every lock is a lock
    kind: raw.kind === 'sharedMailbox' ? 'sharedMailbox' : 'lock',
    reason: String(raw.reason ?? ''),
    lockedAt: String(raw.lockedAt ?? ''),
    lockedBy: String(raw.lockedBy ?? ''),
    delegates: delegates.map((d) => ({
      accountId: String(d.accountId ?? ''),
      name: typeof d.name === 'string' ? d.name : undefined,
      access: (ACCESS_LEVELS as string[]).includes(String(d.access)) ? (d.access as Access) : 'read',
      sendAs: d.sendAs === true,
      until: untilFromServer(d.until as string | null),
    })),
  };
}

/** Every lock in reach, or just the one on `accountId`. */
export async function fetchLocks(accountId?: string, signal?: AbortSignal): Promise<AccountLock[]> {
  const responses = await jmapRequest(
    [[`${OBJECT}/get`, { accountId: getAccountId('x:Account'), ids: accountId ? [accountId] : null }, '0']],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) throw methodError(name, result);
  return ((result as { list?: Record<string, unknown>[] }).list ?? []).map(fromServer);
}

export async function lockAccount(
  accountId: string,
  reason: string,
  delegates: Delegate[],
  kind: LockKind = 'lock',
): Promise<void> {
  const responses = await jmapRequest(
    [
      [
        `${OBJECT}/set`,
        {
          accountId: getAccountId('x:Account'),
          create: {
            l: {
              accountId,
              ...(kind === 'lock' ? {} : { kind }),
              ...(reason.trim() ? { reason: reason.trim() } : {}),
              delegates: toServer(delegates),
            },
          },
        },
        '0',
      ],
    ],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw methodError(name, result);
  const failed = setError(result, 'notCreated', 'l');
  if (failed) throw failed;
}

export async function updateDelegates(lockId: string, delegates: Delegate[], reason: string): Promise<void> {
  const responses = await jmapRequest(
    [
      [
        `${OBJECT}/set`,
        {
          accountId: getAccountId('x:Account'),
          reason: reason.trim(),
          update: { [lockId]: { delegates: toServer(delegates) } },
        },
        '0',
      ],
    ],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw methodError(name, result);
  const failed = setError(result, 'notUpdated', lockId);
  if (failed) throw failed;
}

export async function unlockAccount(lockId: string, reason: string): Promise<void> {
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId: getAccountId('x:Account'), reason: reason.trim(), destroy: [lockId] }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw methodError(name, result);
  const failed = setError(result, 'notDestroyed', lockId);
  if (failed) throw failed;
}
