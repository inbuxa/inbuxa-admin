/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:Relay` and `inbuxa:RelayMessage` over JMAP (relay spec,
 * "Registry objects"). The console never talks to a relay: the server
 * pushes what is saved here, and reads a relay's queues over its own link.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { Relay, RelayMessage } from './model';

const CAPABILITY = 'urn:inbuxa:jmap';

/** The server has no relays (an older server). */
export class RelaysUnavailable extends Error {}

/** This server couldn't reach the relay to read or change its queues. */
export class RelayUnreachable extends Error {}

function failure(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new RelaysUnavailable(r.type);
  if (r?.type === 'serverUnavailable') return new RelayUnreachable(r.description ?? r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

type Call = [string, Record<string, unknown>, string];

async function calls(list: Call[], signal?: AbortSignal): Promise<Record<string, unknown>[]> {
  const accountId = getAccountId('x:Account');
  const responses = await jmapRequest(
    list.map(([method, args, id]) => [method, { accountId, ...args }, id]),
    signal,
    [CAPABILITY],
  );
  return list.map(([method], i) => {
    const [name, result] = responses[i] ?? [];
    if (name !== method) throw failure(name, result);
    return result as Record<string, unknown>;
  });
}

async function call(method: string, args: Record<string, unknown>, signal?: AbortSignal) {
  return (await calls([[method, args, '0']], signal))[0];
}

/** The error the server gave one object of a set call, if it gave one. */
function setFailure(result: Record<string, unknown>, bucket: string, key: string): Error | null {
  const failed = (
    result[bucket] as Record<string, { type?: string; description?: string; properties?: string[] }> | undefined
  )?.[key];
  if (!failed) return null;
  const where = failed.properties?.length ? ` (${failed.properties.join(', ')})` : '';
  return new Error(`${failed.description ?? failed.type ?? 'Not saved'}${where}`);
}

function withReason(reason?: string): Record<string, unknown> {
  return reason?.trim() ? { reason: reason.trim() } : {};
}

// --- Relays -----------------------------------------------------------------

export async function fetchRelays(signal?: AbortSignal): Promise<Relay[]> {
  const result = await call('inbuxa:Relay/get', { ids: null }, signal);
  return ((result.list as Relay[] | undefined) ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

export interface NewRelay {
  name: string;
  address: string;
  linkPort: number;
  hostname: string;
}

/** Adds a relay; its id and its join token, which is never shown again. */
export async function createRelay(relay: NewRelay): Promise<{ id: string; joinToken: string }> {
  const result = await call('inbuxa:Relay/set', {
    create: {
      r: {
        name: relay.name.trim(),
        address: relay.address.trim(),
        linkPort: relay.linkPort,
        settings: { hostname: relay.hostname.trim() },
      },
    },
  });
  const failed = setFailure(result, 'notCreated', 'r');
  if (failed) throw failed;
  const created = (result.created as Record<string, { id: string; joinToken: string }>).r;
  return { id: created.id, joinToken: created.joinToken };
}

export async function updateRelay(id: string, patch: Record<string, unknown>, reason?: string): Promise<void> {
  const result = await call('inbuxa:Relay/set', { ...withReason(reason), update: { [id]: patch } });
  const failed = setFailure(result, 'notUpdated', id);
  if (failed) throw failed;
}

/** Starts a new join, for a relay that was reset: the new token. */
export async function rejoinRelay(id: string, reason?: string): Promise<string> {
  const result = await call('inbuxa:Relay/set', { ...withReason(reason), update: { [id]: { rejoin: true } } });
  const failed = setFailure(result, 'notUpdated', id);
  if (failed) throw failed;
  const token = (result.updated as Record<string, { joinToken?: string } | null> | undefined)?.[id]?.joinToken;
  if (!token) throw new Error('The server gave no join token.');
  return token;
}

export async function deleteRelay(id: string, reason?: string): Promise<void> {
  const result = await call('inbuxa:Relay/set', { ...withReason(reason), destroy: [id] });
  const failed = setFailure(result, 'notDestroyed', id);
  if (failed) throw failed;
}

// --- Its queues ---------------------------------------------------------------

/** What waits at one relay, newest first, read over the server's link. */
export async function fetchRelayMessages(relayId: string, signal?: AbortSignal): Promise<RelayMessage[]> {
  const [, got] = await calls(
    [
      ['inbuxa:RelayMessage/query', { filter: { relayId } }, 'q'],
      ['inbuxa:RelayMessage/get', { '#ids': { resultOf: 'q', name: 'inbuxa:RelayMessage/query', path: '/ids' } }, 'g'],
    ],
    signal,
  );
  return (got.list as RelayMessage[] | undefined) ?? [];
}

/** Discards held mail, or cancels an outbound message, with no DSN. */
export async function destroyRelayMessage(id: string, reason: string): Promise<void> {
  const result = await call('inbuxa:RelayMessage/set', { ...withReason(reason), destroy: [id] });
  const failed = setFailure(result, 'notDestroyed', id);
  if (failed) throw failed;
}
