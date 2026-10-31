/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:Migration` over JMAP (inbuxa-server
 * docs/spec/features/migrations.md). The server runs inbuxa-migrate itself;
 * the console only keeps the answers and sends the actions. A source's
 * secret goes with an action and is held in the server's memory, never
 * stored; it isn't kept here either.
 */

import { apiFetch } from '@/services/api';
import { fetchSession, getAccountId, jmapRequest } from '@/services/jmap/client';
import { fromServer, type Action, type Migration } from './model';

const CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:Migration';

/** The server has no migrations (an older server). */
export class MigrationsUnavailable extends Error {}

/** The run needs the source's secret: none was given, or the server restarted since. */
export class SecretNeeded extends Error {}

type SetError = { type?: string; description?: string; properties?: string[] };

function failure(name: string | undefined, result: unknown): Error {
  const r = result as SetError | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new MigrationsUnavailable(r.type);
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

/** The error the server gave one object of a set call, if it gave one. */
function setFailure(result: Record<string, unknown>, bucket: string, key: string): Error | null {
  const failed = (result[bucket] as Record<string, SetError> | undefined)?.[key];
  if (!failed) return null;
  if (failed.properties?.includes('secret')) return new SecretNeeded(failed.description ?? 'The secret is needed.');
  const where = failed.properties?.length ? ` (${failed.properties.join(', ')})` : '';
  return new Error(`${failed.description ?? failed.type ?? 'Not saved'}${where}`);
}

export async function fetchMigrations(signal?: AbortSignal): Promise<Migration[]> {
  const result = await call(`${OBJECT}/get`, { ids: null }, signal);
  return ((result.list as Record<string, unknown>[] | undefined) ?? []).map(fromServer);
}

/** Saves a new migration's answers: its id. Nothing runs yet. */
export async function createMigration(create: Record<string, unknown>): Promise<string> {
  const result = await call(`${OBJECT}/set`, { create: { m: create } });
  const failed = setFailure(result, 'notCreated', 'm');
  if (failed) throw failed;
  return (result.created as Record<string, { id: string }>).m.id;
}

async function update(id: string, patch: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  const result = await call(`${OBJECT}/set`, { update: { [id]: patch } });
  const failed = setFailure(result, 'notUpdated', id);
  if (failed) throw failed;
  return (result.updated as Record<string, Record<string, unknown> | null> | undefined)?.[id] ?? null;
}

export async function updateMigration(id: string, patch: Record<string, unknown>): Promise<void> {
  if (Object.keys(patch).length) await update(id, patch);
}

/**
 * Starts a run, stops one or closes the migration. A run takes the
 * source's secret when the server doesn't hold it: SecretNeeded says so.
 */
export async function act(id: string, action: Exclude<Action, 'passwords'>, secret?: string): Promise<void> {
  await update(id, secret ? { action, secret } : { action });
}

/** The new accounts' passwords, once: the blob to download. The server deletes its copy. */
export async function takePasswords(id: string): Promise<string> {
  const updated = await update(id, { action: 'passwords' });
  const blobId = updated?.passwordsBlobId;
  if (typeof blobId !== 'string' || !blobId) throw new Error('The server gave no file.');
  return blobId;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder');
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Downloads one of the signed-in person's blobs as a CSV file. */
export async function downloadCsv(blobId: string, fileName: string, owner: string): Promise<void> {
  const session = await fetchSession();
  const template =
    typeof session.downloadUrl === 'string'
      ? session.downloadUrl
      : '/jmap/download/{accountId}/{blobId}/{name}?accept={type}';
  const url = template
    .replace('{accountId}', encodeURIComponent(getAccountId('x:Account')))
    .replace('{blobId}', encodeURIComponent(blobId))
    .replace('{name}', encodeURIComponent(fileName))
    .replace('{type}', encodeURIComponent('text/csv'));
  const response = await apiFetch(pathOf(url));
  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 403
        ? `The file has expired, or it's ${owner}'s to download.`
        : `Download failed (${response.status})`,
    );
  }
  const href = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
