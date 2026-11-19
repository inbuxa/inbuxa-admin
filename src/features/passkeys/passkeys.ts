/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:Passkey` over JMAP (passkeys spec, PK-5 and PK-14 to
 * PK-16). The request's `accountId` names the account whose passkeys these
 * are. Renaming changes only the name; removing one ends every session of
 * the account, the way a password change does.
 */

import { jmapRequest } from '@/services/jmap/client';

const CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:Passkey';

/**
 * What the session says up front about adding a passkey to the signed-in
 * account (PK-19): `allowed` false when a switch turns passkeys off for it,
 * `max` the most it may have. Both undefined from a server that doesn't say;
 * that server refuses the add itself.
 */
export function passkeyPolicy(
  session: Record<string, unknown> | null,
  accountId: string | null,
): { allowed?: boolean; max?: number } {
  if (!session || !accountId) return {};
  const accounts = session.accounts as Record<string, { accountCapabilities?: Record<string, unknown> }> | undefined;
  const cap = accounts?.[accountId]?.accountCapabilities?.[CAPABILITY] as
    | { passkeysAllowed?: unknown; maxPasskeys?: unknown }
    | undefined;
  return {
    allowed: typeof cap?.passkeysAllowed === 'boolean' ? cap.passkeysAllowed : undefined,
    max: typeof cap?.maxPasskeys === 'number' ? cap.maxPasskeys : undefined,
  };
}

/** Longest name the server takes. */
export const MAX_NAME = 64;

export interface Passkey {
  id: string;
  name: string;
  /** `pending` until the browser part of registration completes. */
  state: 'pending' | 'active';
  /** Registered for the server's current relying-party id. */
  usable: boolean;
  /** The authenticator said the key is synced. */
  backedUp: boolean;
  /** RFC 3339, or empty while pending. */
  createdAt: string;
  /** RFC 3339, or empty when never used. */
  lastUsedAt: string;
}

/** The server doesn't offer passkeys (an older server), or this account's aren't in reach. */
export class PasskeysUnavailable extends Error {
  constructor(reason: string) {
    super(`Passkeys unavailable: ${reason}`);
  }
}

/** A create the server refused: passkeys are off for the account, or it holds as many as it may. */
export class PasskeyRefused extends Error {
  readonly kind: 'forbidden' | 'overQuota' | 'other';
  constructor(kind: 'forbidden' | 'overQuota' | 'other', message: string) {
    super(message);
    this.kind = kind;
  }
}

function methodError(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability' || r?.type === 'forbidden')
    return new PasskeysUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function fromServer(raw: Record<string, unknown>): Passkey {
  return {
    id: String(raw.id ?? ''),
    name: str(raw.name),
    state: raw.state === 'pending' ? 'pending' : 'active',
    usable: raw.usable === true,
    backedUp: raw.backedUp === true,
    createdAt: str(raw.createdAt),
    lastUsedAt: str(raw.lastUsedAt),
  };
}

/** Active ones first, newest first; pending ones last. */
export function sortPasskeys(list: Passkey[]): Passkey[] {
  return [...list].sort((a, b) => {
    if (a.state !== b.state) return a.state === 'active' ? -1 : 1;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const responses = await jmapRequest([[`${OBJECT}/${method}`, args, '0']], signal, [CAPABILITY]);
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/${method}`) throw methodError(name, result);
  return result as Record<string, unknown>;
}

/** Every passkey of `accountId`. */
export async function fetchPasskeys(accountId: string, signal?: AbortSignal): Promise<Passkey[]> {
  const result = await call('get', { accountId, ids: null }, signal);
  return sortPasskeys(((result.list as Record<string, unknown>[] | undefined) ?? []).map(fromServer));
}

/** Starts registering a passkey on the signed-in person's own account; returns the page that finishes it. */
export async function createPasskey(accountId: string, name: string): Promise<string> {
  const result = await call('set', { accountId, create: { p: { accountId, name: name.trim() } } });
  const failed = (result.notCreated as Record<string, { type?: string; description?: string }> | undefined)?.p;
  if (failed) {
    const kind = failed.type === 'forbidden' || failed.type === 'overQuota' ? failed.type : 'other';
    throw new PasskeyRefused(kind, failed.description ?? failed.type ?? 'Not added');
  }
  const created = (result.created as Record<string, Record<string, unknown>> | undefined)?.p;
  const url = str(created?.registrationUrl);
  if (!url) throw new Error('The server returned no registration page');
  return url;
}

export async function renamePasskey(accountId: string, id: string, name: string): Promise<void> {
  const result = await call('set', { accountId, update: { [id]: { name: name.trim() } } });
  const failed = (result.notUpdated as Record<string, { type?: string; description?: string }> | undefined)?.[id];
  if (failed) throw new Error(failed.description ?? failed.type ?? 'Not renamed');
}

/** Removes the given passkeys; the account's sessions end when any active one goes. */
export async function removePasskeys(accountId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const result = await call('set', { accountId, destroy: ids });
  const failed = (result.notDestroyed as Record<string, { type?: string; description?: string }> | undefined) ?? {};
  const first = Object.values(failed)[0];
  if (first) throw new Error(first.description ?? first.type ?? 'Not removed');
}

/** What's wrong with a name before it's sent, or null. */
export function nameProblem(name: string): 'empty' | 'tooLong' | null {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  if ([...trimmed].length > MAX_NAME) return 'tooLong';
  return null;
}
