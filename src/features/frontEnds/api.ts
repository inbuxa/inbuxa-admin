/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** INBUXA: `inbuxa:FrontEnds/get` and `/set` (contract C-4). */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { fromServer, type FrontEnds } from './model';

const CAPABILITY = 'urn:inbuxa:jmap';

/** The server has no `inbuxa:FrontEnds` (an older server, or inside a tenant). */
export class FrontEndsUnavailable extends Error {}

async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal) {
  const responses = await jmapRequest([[method, { accountId: getAccountId('x:Account'), ...args }, '0']], signal, [
    CAPABILITY,
  ]);
  const [name, result] = responses[0] ?? [];
  const r = result as Record<string, unknown> & { type?: string; description?: string };
  if (name !== method) {
    if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') throw new FrontEndsUnavailable(r.type);
    throw new Error(r?.description ?? r?.type ?? `${method} failed`);
  }
  return r;
}

export async function fetchFrontEnds(signal?: AbortSignal): Promise<FrontEnds> {
  const result = await call('inbuxa:FrontEnds/get', { ids: null }, signal);
  const item = (result.list as Record<string, unknown>[] | undefined)?.[0];
  if (!item) throw new FrontEndsUnavailable('not found');
  return fromServer(item);
}

/** Saves `patch`; throws with the server's reason if it refused. */
export async function saveFrontEnds(patch: Record<string, unknown>): Promise<void> {
  const result = await call('inbuxa:FrontEnds/set', { update: { singleton: patch } });
  const failed = (
    result.notUpdated as Record<string, { type?: string; description?: string; properties?: string[] }> | undefined
  )?.singleton;
  if (failed) {
    const where = failed.properties?.length ? ` (${failed.properties.join(', ')})` : '';
    throw new Error(`${failed.description ?? failed.type ?? 'Not saved'}${where}`);
  }
}
