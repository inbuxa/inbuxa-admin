/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * JMAP (RFC 8620) over apiFetch: one request of method calls, and helpers
 * for the common shapes (get, set, query then get, everything a query
 * matches). Settings live on the primary account as `x:` registry objects;
 * mail, calendars and the like live on the account being looked at.
 */
import { logJmapExchange } from '@/lib/debug';
import { registryWrites, writesRegistry, type RegistryWrite } from '@/lib/settingsApply';
import { apiFetch } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import type { JmapMethodCall, JmapMethodResponse, JmapQueryResponse, JmapResponse } from '@/types/jmap';
import type { Schema } from '@/types/schema';

/** The capabilities every request declares; callers can add more. */
const CAPABILITIES = [
  'urn:ietf:params:jmap:core',
  'urn:inbuxa:jmap:registry',
  'urn:ietf:params:jmap:blob',
  'urn:ietf:params:jmap:mail',
  'urn:ietf:params:jmap:calendars',
  'urn:ietf:params:jmap:contacts',
  'urn:ietf:params:jmap:principals',
  'urn:ietf:params:jmap:sieve',
  'urn:ietf:params:jmap:vacationresponse',
];

/** The account an object type lives on: the primary account for `x:` registry objects, else the active one. */
export function getAccountId(objectType: string): string {
  const { primaryAccountId, activeAccountId } = useAuthStore.getState();
  const registry = objectType.startsWith('x:');
  const id = registry ? primaryAccountId : activeAccountId;
  if (!id) throw new Error(registry ? 'No primary account ID available' : 'No active account ID available');
  return id;
}

/**
 * Told about every request that writes the registry, so saved settings can
 * be applied on the server (settingsApplyStore): `started` before it goes
 * out, `finished` once it settles, with what it changed.
 */
export interface RegistryWriteListener {
  started(): void;
  finished(writes: RegistryWrite[]): void;
}

let registryListener: RegistryWriteListener | null = null;

export function setRegistryWriteListener(listener: RegistryWriteListener | null) {
  registryListener = listener;
}

/** The JMAP API's path on the server, from the session's apiUrl. */
function apiPath(): string {
  const { apiUrl } = useAuthStore.getState();
  if (!apiUrl) return '/jmap';
  if (!/^https?:\/\//.test(apiUrl)) return apiUrl;
  // Absolute: keep only the path, since apiFetch puts the server's address in front.
  return URL.canParse(apiUrl) ? new URL(apiUrl).pathname : '/jmap';
}

async function send(calls: JmapMethodCall[], signal?: AbortSignal, extraCapabilities: string[] = []) {
  const started = performance.now();
  const res = await apiFetch(apiPath(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ using: [...CAPABILITIES, ...extraCapabilities], methodCalls: calls }),
    signal,
  });
  const { methodResponses } = (await res.json()) as JmapResponse;
  logJmapExchange(calls, methodResponses, performance.now() - started);
  if (import.meta.env.DEV) {
    for (const [name, args, callId] of methodResponses) {
      if (name === 'error') console.error(`JMAP error [${callId}]:`, args);
    }
  }
  return methodResponses;
}

/** Sends method calls in one request and returns the method responses, in order. */
export async function jmapRequest(
  methodCalls: JmapMethodCall[],
  signal?: AbortSignal,
  extraUsing: string[] = [],
): Promise<JmapMethodResponse[]> {
  const listener = writesRegistry(methodCalls) ? registryListener : null;
  if (!listener) return send(methodCalls, signal, extraUsing);
  listener.started();
  let writes: RegistryWrite[] = [];
  try {
    const responses = await send(methodCalls, signal, extraUsing);
    writes = registryWrites(responses);
    return responses;
  } finally {
    listener.finished(writes);
  }
}

/** `<type>/get` for some ids, or all of them (null). */
export function jmapGet(
  objectType: string,
  accountId: string,
  ids: string[] | null,
  properties?: string[],
  signal?: AbortSignal,
): Promise<JmapMethodResponse[]> {
  return jmapRequest([[`${objectType}/get`, { accountId, ids, ...(properties && { properties }) }, '0']], signal);
}

interface JmapQueryOptions {
  filter?: Record<string, unknown>;
  sort?: Record<string, unknown>[];
  limit?: number;
  position?: number;
  anchor?: string;
  anchorOffset?: number;
  calculateTotal?: boolean;
}

interface JmapSetOptions {
  create?: Record<string, Record<string, unknown>>;
  update?: Record<string, Record<string, unknown>>;
  destroy?: string[];
}

/** `<type>/set`: create, update and destroy in one call. */
export function jmapSet(objectType: string, accountId: string, options: JmapSetOptions = {}) {
  return jmapRequest([[`${objectType}/set`, { accountId, ...options }, '0']]);
}

/** A page of `<type>/query` and the objects it found, in one request. */
export function jmapQueryAndGet(
  objectType: string,
  accountId: string,
  queryOptions: JmapQueryOptions = {},
  properties?: string[],
): Promise<JmapMethodResponse[]> {
  const foundIds = { resultOf: '0', name: `${objectType}/query`, path: '/ids' };
  return jmapRequest([
    [`${objectType}/query`, { accountId, ...queryOptions }, '0'],
    [`${objectType}/get`, { accountId, '#ids': foundIds, ...(properties && { properties }) }, '1'],
  ]);
}

/** The arguments of a single response, or an error naming the call that failed. */
function onlyResult(responses: JmapMethodResponse[], call: string): Record<string, unknown> {
  const [name, args] = responses[0];
  if (name === 'error') throw new Error(`JMAP ${call} error: ${(args as Record<string, unknown>).type ?? 'unknown'}`);
  return args as Record<string, unknown>;
}

/** The objects with these ids, fetched in as many requests as the server's maxObjectsInGet asks. */
export async function jmapGetBatched(
  objectType: string,
  accountId: string,
  ids: string[],
  properties?: string[],
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const perRequest = useAuthStore.getState().maxObjectsInGet;
  const found: Record<string, unknown>[] = [];
  for (let at = 0; at < ids.length && !signal?.aborted; at += perRequest) {
    const responses = await jmapGet(objectType, accountId, ids.slice(at, at + perRequest), properties, signal);
    const { list } = onlyResult(responses, `${objectType}/get`) as { list?: Record<string, unknown>[] };
    found.push(...(list ?? []));
  }
  return found;
}

/** Most pages a query is followed for, a guard against a server that never says it's done. */
const MAX_PAGES = 1000;

/**
 * Every id a query matches, page after page. Each page starts after the last
 * id of the one before (anchor, offset 1). It stops at an empty page, or
 * when the server's answer has no limit, meaning it sent everything.
 */
export async function jmapQueryAll(
  objectType: string,
  accountId: string,
  queryOptions: JmapQueryOptions = {},
  signal?: AbortSignal,
): Promise<string[]> {
  const ids: string[] = [];
  let after: string | undefined;
  for (let page = 0; page < MAX_PAGES && !signal?.aborted; page++) {
    const args: Record<string, unknown> = { accountId, ...queryOptions };
    if (after) {
      delete args.position;
      Object.assign(args, { anchor: after, anchorOffset: 1 });
    }
    const responses = await jmapRequest([[`${objectType}/query`, args, '0']], signal);
    const result = onlyResult(responses, `${objectType}/query`) as unknown as JmapQueryResponse;
    const pageIds = result.ids ?? [];
    if (pageIds.length === 0) break;
    ids.push(...pageIds);
    if (result.limit == null) break;
    after = pageIds[pageIds.length - 1];
  }
  return ids;
}

/** Everything a query matches: the ids, and the objects. */
export async function jmapQueryAllAndGet(
  objectType: string,
  accountId: string,
  queryOptions: JmapQueryOptions = {},
  properties?: string[],
  signal?: AbortSignal,
): Promise<{ ids: string[]; list: Record<string, unknown>[] }> {
  const ids = await jmapQueryAll(objectType, accountId, queryOptions, signal);
  const list = ids.length ? await jmapGetBatched(objectType, accountId, ids, properties, signal) : [];
  return { ids, list };
}

const getJson = async <T>(path: string): Promise<T> => (await apiFetch(path)).json() as Promise<T>;

/** The JMAP session: accounts, capabilities, the API URL. */
export const fetchSession = () => getJson<Record<string, unknown>>('/jmap/session');

/** The server's description of every setting, which builds the settings pages. */
export const fetchSchema = () => getJson<Schema>('/api/schema');

/** The signed-in admin's permissions, the server's edition and the admin's locale. */
export const fetchAccountInfo = () =>
  getJson<{ permissions: string[]; edition: 'enterprise' | 'community' | 'oss'; locale: string }>('/api/account');
