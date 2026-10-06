/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: accepted security items (security to-do list spec, SS-23 to
 * SS-26), kept on the server as inbuxa:SecurityAcceptance so every
 * administrator sees them. An acceptance holds only while its check still
 * sees the value it was accepted for (SS-24).
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { INBUXA_CAPABILITY } from '@/features/hardening/protocolPolicy';
import type { Item } from './checks';

const OBJECT = 'inbuxa:SecurityAcceptance';

export interface Acceptance {
  id: string;
  check: string;
  subject: string;
  acceptedValue: unknown;
  note: string;
  acceptedBy: string;
  acceptedAt: string;
}

/** The server has no acceptances: the page works without the Accept action. */
export class AcceptancesUnavailable extends Error {}

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

export interface Sorted {
  /** Still to do, each with the acceptance it had for another value, if any. */
  todo: { item: Item; stale?: Acceptance }[];
  /** Accepted, and still the same value. */
  accepted: { item: Item; acceptance: Acceptance }[];
}

/** Splits the failing checks into what's still to do and what's accepted (SS-24, SS-25). */
export function sortOut(items: Item[], acceptances: Acceptance[]): Sorted {
  const out: Sorted = { todo: [], accepted: [] };
  for (const item of items) {
    const mine = acceptances.filter((a) => a.check === item.check && a.subject === item.subject);
    const holding = mine.find((a) => sameValue(a.acceptedValue, item.value));
    if (holding) out.accepted.push({ item, acceptance: holding });
    else out.todo.push({ item, stale: mine[0] });
  }
  return out;
}

async function call(method: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const responses = await jmapRequest(
    [[`${OBJECT}/${method}`, { accountId: getAccountId('x:Security'), ...args }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/${method}`) {
    const r = result as { type?: string; description?: string } | undefined;
    if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') throw new AcceptancesUnavailable(r.type);
    throw new Error(r?.description ?? r?.type ?? 'Request failed');
  }
  return result as Record<string, unknown>;
}

export async function fetchAcceptances(): Promise<Acceptance[]> {
  const result = await call('get', { ids: null });
  return ((result.list as Record<string, unknown>[] | undefined) ?? []).map((a) => ({
    id: String(a.id),
    check: String(a.check),
    subject: String(a.subject ?? ''),
    acceptedValue: a.acceptedValue,
    note: String(a.note ?? ''),
    acceptedBy: String(a.acceptedBy ?? ''),
    acceptedAt: String(a.acceptedAt ?? ''),
  }));
}

/** Accepts an item with a note, removing any earlier acceptance for another value in the same call. */
export async function accept(item: Item, note: string, replaces?: Acceptance): Promise<void> {
  const result = await call('set', {
    create: { a: { check: item.check, subject: item.subject, acceptedValue: item.value ?? null, note } },
    ...(replaces ? { destroy: [replaces.id] } : {}),
  });
  const failed = (result.notCreated as Record<string, { description?: string; type?: string }> | undefined)?.a;
  if (failed) throw new Error(failed.description ?? failed.type);
}

export async function removeAcceptance(acceptance: Acceptance): Promise<void> {
  const result = await call('set', { destroy: [acceptance.id] });
  const failed = (result.notDestroyed as Record<string, { description?: string; type?: string }> | undefined)?.[
    acceptance.id
  ];
  if (failed) throw new Error(failed.description ?? failed.type);
}
