/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:DeletedAccount` over JMAP (undelete spec, UD-15 to
 * UD-17a). With account retention set, a deleted account is kept for the
 * period with its name and addresses held. It can be restored, with a new
 * password for a person, or destroyed now, which frees them.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';

export const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:DeletedAccount';

export interface DeletedAccount {
  id: string;
  name: string;
  addresses: string[];
  memberTenantId: string | null;
  /** RFC 3339. */
  deletedAt: string;
  /** RFC 3339: when it's destroyed for good. */
  keptUntil: string;
}

/** The server doesn't keep deleted accounts (an older server). */
export class DeletedAccountsUnavailable extends Error {
  constructor(reason: string) {
    super(`Deleted accounts unavailable: ${reason}`);
  }
}

function methodError(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new DeletedAccountsUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

function setError(result: unknown, bucket: string, key: string): Error | null {
  const failed = (result as Record<string, Record<string, { description?: string; type?: string }> | undefined>)[
    bucket
  ]?.[key];
  return failed ? new Error(failed.description ?? failed.type ?? 'Not saved') : null;
}

export function fromServer(raw: Record<string, unknown>): DeletedAccount {
  return {
    id: String(raw.id ?? ''),
    name: String(raw.name ?? ''),
    addresses: Array.isArray(raw.addresses) ? raw.addresses.map(String) : [],
    memberTenantId: typeof raw.memberTenantId === 'string' ? raw.memberTenantId : null,
    deletedAt: String(raw.deletedAt ?? ''),
    keptUntil: String(raw.keptUntil ?? ''),
  };
}

/** Soonest to be destroyed first. */
export function byKeptUntil(a: DeletedAccount, b: DeletedAccount): number {
  return a.keptUntil.localeCompare(b.keptUntil) || a.name.localeCompare(b.name);
}

/** Every kept account in reach. */
export async function fetchDeletedAccounts(signal?: AbortSignal): Promise<DeletedAccount[]> {
  const responses = await jmapRequest(
    [[`${OBJECT}/get`, { accountId: getAccountId('x:Account'), ids: null }, '0']],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) throw methodError(name, result);
  return ((result as { list?: Record<string, unknown>[] }).list ?? []).map(fromServer).sort(byKeptUntil);
}

/**
 * Brings a kept account back under the same id. A person needs a new
 * password; a group needs none, so an empty one isn't sent.
 */
export async function restoreDeletedAccount(id: string, password: string): Promise<void> {
  const responses = await jmapRequest(
    [
      [
        `${OBJECT}/set`,
        {
          accountId: getAccountId('x:Account'),
          update: { [id]: { restore: true, ...(password ? { password } : {}) } },
        },
        '0',
      ],
    ],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw methodError(name, result);
  const failed = setError(result, 'notUpdated', id);
  if (failed) throw failed;
}

/** Destroys a kept account now, which frees its name and addresses. */
export async function destroyDeletedAccount(id: string): Promise<void> {
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId: getAccountId('x:Account'), destroy: [id] }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw methodError(name, result);
  const failed = setError(result, 'notDestroyed', id);
  if (failed) throw failed;
}
