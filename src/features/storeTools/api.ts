/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:StoreCheck`, `inbuxa:StoreSnapshot` and
 * `inbuxa:BlobStoreChange` over JMAP. They're under `urn:inbuxa:jmap`, not
 * the registry, and each is the server administrator's alone.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import {
  changeFromServer,
  checkFromServer,
  snapshotFromServer,
  type BlobStoreChange,
  type CheckMode,
  type StoreCheck,
  type StoreSnapshot,
} from './model';

const CAPABILITY = 'urn:inbuxa:jmap';

export const STORE_CHECK = 'inbuxa:StoreCheck';
export const STORE_SNAPSHOT = 'inbuxa:StoreSnapshot';
export const BLOB_STORE_CHANGE = 'inbuxa:BlobStoreChange';
type StoreObject = typeof STORE_CHECK | typeof STORE_SNAPSHOT | typeof BLOB_STORE_CHANGE;

/** The server doesn't have this object (older than 27.1-rc.16 or 2026.11.9.1). */
export class StoreToolUnavailable extends Error {}

type SetError = { type?: string; description?: string; properties?: string[] };

function failure(name: string | undefined, result: unknown): Error {
  const r = result as SetError | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new StoreToolUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const responses = await jmapRequest([[method, { accountId: getAccountId('x:Account'), ...args }, '0']], signal, [
    CAPABILITY,
  ]);
  const [name, result] = responses[0] ?? [];
  if (name !== method) throw failure(name, result);
  return result as Record<string, unknown>;
}

function setFailure(result: Record<string, unknown>, bucket: string, key: string): Error | null {
  const failed = (result[bucket] as Record<string, SetError> | undefined)?.[key];
  if (!failed) return null;
  return new Error(failed.description ?? failed.type ?? 'Refused');
}

async function getAll(object: StoreObject, signal?: AbortSignal) {
  const result = await call(`${object}/get`, { ids: null }, signal);
  return (result.list as Record<string, unknown>[] | undefined) ?? [];
}

async function create(object: StoreObject, props: Record<string, unknown>): Promise<string> {
  const result = await call(`${object}/set`, { create: { c: props } });
  const failed = setFailure(result, 'notCreated', 'c');
  if (failed) throw failed;
  return String((result.created as Record<string, { id: string }>).c.id);
}

async function update(object: StoreObject, id: string, patch: Record<string, unknown>): Promise<void> {
  const result = await call(`${object}/set`, { update: { [id]: patch } });
  const failed = setFailure(result, 'notUpdated', id);
  if (failed) throw failed;
}

async function destroy(object: StoreObject, id: string): Promise<void> {
  const result = await call(`${object}/set`, { destroy: [id] });
  const failed = setFailure(result, 'notDestroyed', id);
  if (failed) throw failed;
}

/** The limits to send: only those set, so the server's defaults apply to the rest. */
function limits(blobsPerSecond: number | null, bytesPerSecond: number | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (blobsPerSecond != null) out.blobsPerSecond = blobsPerSecond;
  if (bytesPerSecond != null) out.bytesPerSecond = bytesPerSecond;
  return out;
}

// ── Store check ──

export const fetchChecks = async (signal?: AbortSignal): Promise<StoreCheck[]> =>
  (await getAll(STORE_CHECK, signal)).map(checkFromServer);

export const startCheck = (mode: CheckMode, blobsPerSecond: number | null, bytesPerSecond: number | null) =>
  create(STORE_CHECK, { mode, ...limits(blobsPerSecond, bytesPerSecond) });

export const stopCheck = (id: string) => update(STORE_CHECK, id, { action: 'stop' });
export const deleteCheck = (id: string) => destroy(STORE_CHECK, id);

// ── Store snapshot ──

export const fetchSnapshots = async (signal?: AbortSignal): Promise<StoreSnapshot[]> =>
  (await getAll(STORE_SNAPSHOT, signal)).map(snapshotFromServer);

export const takeSnapshot = () => create(STORE_SNAPSHOT, {});
export const deleteSnapshot = (id: string) => destroy(STORE_SNAPSHOT, id);

// ── Blob store change ──

export const fetchChanges = async (signal?: AbortSignal): Promise<BlobStoreChange[]> =>
  (await getAll(BLOB_STORE_CHANGE, signal)).map(changeFromServer);

export const startCopy = (id: string, blobsPerSecond: number | null, bytesPerSecond: number | null) =>
  update(BLOB_STORE_CHANGE, id, { action: 'copy', ...limits(blobsPerSecond, bytesPerSecond) });

export const stopCopy = (id: string) => update(BLOB_STORE_CHANGE, id, { action: 'stop' });
export const dismissChange = (id: string) => destroy(BLOB_STORE_CHANGE, id);

/** CA-1: plan a change to the store these settings (an `x:BlobStore` value) describe. */
export const planChange = (target: Record<string, unknown>) => create(BLOB_STORE_CHANGE, { target });

/** CA-7: write a planned change's store to the blob store setting. */
export const applyChange = (id: string) => update(BLOB_STORE_CHANGE, id, { action: 'apply' });
