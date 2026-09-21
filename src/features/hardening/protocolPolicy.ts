/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:ProtocolPolicy`, the server-wide legacy mail protocols switch
 * (legacy-protocols spec). This module is the wire and the rules; the screen
 * and the banner draw from it.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapSetError } from '@/types/jmap';

export const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:ProtocolPolicy';

/** The phrase that turns legacy protocols off (LP-17). Turning them back on needs none. */
export const CONFIRM_PHRASE = 'turn off legacy mail';

/** A listener the switch closed, or would close, by name and port (LP-16). */
export interface PolicyListener {
  name: string;
  protocol: string;
  ports: number[];
}

export interface ProtocolPolicy {
  legacyProtocols: 'enabled' | 'disabled';
  closeSubmission: boolean;
  /** Listeners taken away and not yet put back. Non-empty while enabled means some failed to reopen (LP-5). */
  savedListeners: PolicyListener[];
  /** Milliseconds since the epoch. */
  changedAt: number | null;
  changedBy: string | null;
  /** Registry protocols the switch may never close (LP-21), as the server says. */
  lockedProtocols: string[];
  /** What turning the switch off would close, whichever way it is set now (LP-16). */
  wouldClose: PolicyListener[];
}

/**
 * The server sends each listener as an object keyed by the policy's own
 * property names: `id` is the listener's name, `legacyProtocols` its protocol
 * and `wouldClose` its ports. Read them back into something that says so.
 */
function parseListener(raw: unknown): PolicyListener | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string') return null;
  return {
    name: r.id,
    protocol: typeof r.legacyProtocols === 'string' ? r.legacyProtocols : '',
    ports: Array.isArray(r.wouldClose) ? r.wouldClose.filter((p): p is number => typeof p === 'number') : [],
  };
}

function parseListeners(raw: unknown): PolicyListener[] {
  return Array.isArray(raw) ? raw.map(parseListener).filter((l): l is PolicyListener => l !== null) : [];
}

export function parsePolicy(raw: Record<string, unknown>): ProtocolPolicy {
  return {
    legacyProtocols: raw.legacyProtocols === 'disabled' ? 'disabled' : 'enabled',
    closeSubmission: raw.closeSubmission === true,
    savedListeners: parseListeners(raw.savedListeners),
    changedAt: typeof raw.changedAt === 'number' ? raw.changedAt : null,
    changedBy: typeof raw.changedBy === 'string' ? raw.changedBy : null,
    lockedProtocols: Array.isArray(raw.lockedProtocols)
      ? raw.lockedProtocols.filter((p): p is string => typeof p === 'string')
      : [],
    wouldClose: parseListeners(raw.wouldClose),
  };
}

/** Thrown when the server has no `inbuxa:ProtocolPolicy`, so callers can stay quiet about it. */
export class PolicyUnavailable extends Error {}

export async function fetchProtocolPolicy(signal?: AbortSignal): Promise<ProtocolPolicy> {
  const accountId = getAccountId('x:NetworkListener');
  const responses = await jmapRequest([[`${OBJECT}/get`, { accountId, ids: null }, '0']], signal, [INBUXA_CAPABILITY]);
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) {
    const type = (result as { type?: string } | undefined)?.type;
    if (type === 'unknownMethod' || type === 'unknownCapability') throw new PolicyUnavailable(type);
    throw new Error((result as { description?: string } | undefined)?.description ?? type ?? 'Request failed');
  }
  const list = (result as { list?: Record<string, unknown>[] }).list ?? [];
  if (!list[0]) throw new PolicyUnavailable('notFound');
  return parsePolicy(list[0]);
}

export interface SetOutcome {
  /** What the server stored differently from what was asked (LP-21), or nothing. */
  overruled: Record<string, unknown> | null;
}

export async function updateProtocolPolicy(
  update: Partial<Pick<ProtocolPolicy, 'legacyProtocols' | 'closeSubmission'>>,
): Promise<SetOutcome> {
  const accountId = getAccountId('x:NetworkListener');
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId, update: { singleton: update } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) {
    throw new Error((result as { description?: string } | undefined)?.description ?? 'Request failed');
  }
  const r = result as {
    updated?: Record<string, Record<string, unknown> | null> | null;
    notUpdated?: Record<string, JmapSetError> | null;
  };
  const failed = r.notUpdated?.singleton;
  if (failed) throw new Error(failed.description ?? failed.type);
  const stored = r.updated?.singleton;
  return { overruled: stored && Object.keys(stored).length > 0 ? stored : null };
}

/** How a protocol stands under the switch, for the selector (LP-21). */
export type RowState = 'closes' | 'refused' | 'locked';

export interface ProtocolRow {
  key: string;
  label: string;
  state: RowState;
  /** Ports that close with the switch; empty when nothing is listening or the row doesn't close. */
  ports: number[];
}

function portsOf(listeners: PolicyListener[], protocol: string): number[] {
  const ports = listeners.filter((l) => l.protocol === protocol).flatMap((l) => l.ports);
  return [...new Set(ports)].sort((a, b) => a - b);
}

/**
 * Every mail protocol the server speaks, in one place, with what the switch
 * does to each. The locked set comes from the server, so unlocking later is
 * a server change and no admin release (LP-21).
 *
 * `listeners` is what the switch closes: `wouldClose` while it's on, or
 * `savedListeners` once it's off.
 */
export function protocolRows(policy: ProtocolPolicy, listeners: PolicyListener[]): ProtocolRow[] {
  const locked = new Set(policy.lockedProtocols.map((p) => p.toLowerCase()));
  const legacy: ProtocolRow[] = [
    { key: 'imap', label: 'IMAP', state: 'closes', ports: portsOf(listeners, 'imap') },
    { key: 'pop3', label: 'POP3', state: 'closes', ports: portsOf(listeners, 'pop3') },
    { key: 'manageSieve', label: 'ManageSieve', state: 'closes', ports: portsOf(listeners, 'manageSieve') },
  ];
  const smtpLocked = locked.has('smtp');
  return [
    ...legacy,
    {
      key: 'submission',
      label: 'SMTP submission',
      // Locked submission keeps its ports; sign-in over them is refused instead.
      state: smtpLocked ? 'locked' : policy.closeSubmission ? 'closes' : 'refused',
      ports: smtpLocked ? [] : portsOf(listeners, 'smtp'),
    },
    // Incoming mail and JMAP are never the switch's to close (LP-3, "Not affected, ever").
    { key: 'smtp', label: 'SMTP (incoming mail)', state: 'locked', ports: [] },
    { key: 'jmap', label: 'JMAP (INBUXA webmail)', state: 'locked', ports: [] },
  ];
}

/** Whether the typed confirmation matches (LP-17). Exact: no trimming, no case folding. */
export function phraseMatches(typed: string): boolean {
  return typed === CONFIRM_PHRASE;
}

export function describeListener(l: PolicyListener): string {
  return l.ports.length > 0 ? `${l.name} (${l.ports.join(', ')})` : l.name;
}
