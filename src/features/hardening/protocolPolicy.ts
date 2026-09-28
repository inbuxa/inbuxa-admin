/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:ProtocolPolicy`, the server-wide legacy mail protocols
 * switches (legacy-protocols spec). IMAP, POP3 and ManageSieve each have their
 * own; `legacyProtocols` is the kill-all, which sets all three and reads
 * `disabled` when all three are off. This module is the wire and the rules;
 * the screen and the banner draw from it.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapSetError } from '@/types/jmap';

export const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:ProtocolPolicy';

/** The phrase that turns legacy protocols off (LP-17). Turning them back on needs none. */
export const CONFIRM_PHRASE = 'turn off legacy mail';

export type Switch = 'enabled' | 'disabled';

/** The protocols with a switch of their own, as the server names them. */
export const SWITCHED = ['imap', 'pop3', 'manageSieve'] as const;
export type SwitchedProtocol = (typeof SWITCHED)[number];
export type Switches = Record<SwitchedProtocol, Switch>;

/** What a /set may change: the kill-all, any of the three, or both. */
export type SwitchUpdate = Partial<Record<'legacyProtocols' | SwitchedProtocol, Switch>>;

/**
 * Each protocol's switch. A server from before the per-protocol switches
 * sends only `legacyProtocols`, which then stands for all three.
 */
function parseSwitches(raw: Record<string, unknown>): Switches {
  const all: Switch = raw.legacyProtocols === 'disabled' ? 'disabled' : 'enabled';
  const one = (value: unknown): Switch => (value === 'disabled' ? 'disabled' : value === 'enabled' ? 'enabled' : all);
  return { imap: one(raw.imap), pop3: one(raw.pop3), manageSieve: one(raw.manageSieve) };
}

/** The protocols switched off, in the order the screen lists them. */
export function offProtocols(switches: Switches): SwitchedProtocol[] {
  return SWITCHED.filter((p) => switches[p] === 'disabled');
}

/** A listener the switch closed, or would close, by name and port (LP-16). */
export interface PolicyListener {
  name: string;
  protocol: string;
  ports: number[];
}

export interface ProtocolPolicy {
  /** The kill-all: `disabled` only when all three protocols are off. */
  legacyProtocols: Switch;
  switches: Switches;
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
  /**
   * Who signed in over a legacy protocol in the last 30 days (LP-15), or null
   * from a server too old to say -- which is not the same as nobody.
   */
  recentLegacyUse: RecentUse[] | null;
}

/** One account's last sign-in over one legacy protocol, as the server reports it. */
export interface RecentUse {
  accountId: string;
  name: string;
  protocol: string;
  /** Milliseconds since the epoch. */
  lastUsedAt: number;
}

/** One account on the impact panel: every protocol it used, and when it last did. */
export interface ImpactEntry {
  name: string;
  protocols: string[];
  lastUsedAt: number;
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
    switches: parseSwitches(raw),
    closeSubmission: raw.closeSubmission === true,
    savedListeners: parseListeners(raw.savedListeners),
    changedAt: typeof raw.changedAt === 'number' ? raw.changedAt : null,
    changedBy: typeof raw.changedBy === 'string' ? raw.changedBy : null,
    lockedProtocols: Array.isArray(raw.lockedProtocols)
      ? raw.lockedProtocols.filter((p): p is string => typeof p === 'string')
      : [],
    wouldClose: parseListeners(raw.wouldClose),
    recentLegacyUse: Array.isArray(raw.recentLegacyUse) ? parseRecent(raw.recentLegacyUse) : null,
  };
}

function parseRecent(raw: unknown[]): RecentUse[] {
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const r = entry as Record<string, unknown>;
    if (typeof r.name !== 'string' || typeof r.protocol !== 'string' || typeof r.lastUsedAt !== 'number') return [];
    return [
      {
        accountId: typeof r.accountId === 'string' ? r.accountId : '',
        name: r.name,
        protocol: r.protocol,
        lastUsedAt: r.lastUsedAt,
      },
    ];
  });
}

export const PROTOCOL_LABELS: Record<string, string> = {
  imap: 'IMAP',
  pop3: 'POP3',
  manageSieve: 'ManageSieve',
  submission: 'SMTP submission',
};

/**
 * The impact panel's lines (LP-15): one per account, naming every protocol it
 * used and when it last used any, most recent first.
 */
export function impactEntries(recent: RecentUse[]): ImpactEntry[] {
  const byAccount = new Map<string, ImpactEntry>();
  for (const use of recent) {
    const key = use.accountId || use.name;
    const entry = byAccount.get(key) ?? { name: use.name, protocols: [], lastUsedAt: 0 };
    const label = PROTOCOL_LABELS[use.protocol] ?? use.protocol;
    if (!entry.protocols.includes(label)) entry.protocols.push(label);
    entry.lastUsedAt = Math.max(entry.lastUsedAt, use.lastUsedAt);
    byAccount.set(key, entry);
  }
  const order = Object.values(PROTOCOL_LABELS);
  return [...byAccount.values()]
    .map((e) => ({ ...e, protocols: e.protocols.sort((a, b) => order.indexOf(a) - order.indexOf(b)) }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt || a.name.localeCompare(b.name));
}

/** The accounts that used one protocol lately (or `submission`), for its row and its switch. */
export function usersOf(recent: RecentUse[], protocol: SwitchedProtocol | 'submission'): ImpactEntry[] {
  return impactEntries(recent.filter((use) => use.protocol === protocol));
}

/** "2 days ago", "3 hours ago", "just now", in the reader's language. */
export function ago(at: number, now: number, locale?: string): string {
  const seconds = Math.round((at - now) / 1000);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'minute');
}

/** Thrown when the server has no `inbuxa:ProtocolPolicy`, so callers can stay quiet about it. */
export class PolicyUnavailable extends Error {}

export async function fetchProtocolPolicy(signal?: AbortSignal): Promise<ProtocolPolicy> {
  const accountId = getAccountId('x:NetworkListener');
  // No `properties`: the server answers with all of them, recentLegacyUse
  // included where it has it.
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
  update: SwitchUpdate & Partial<Pick<ProtocolPolicy, 'closeSubmission'>>,
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
  /** For a protocol with its own switch: whether it is off now. */
  off?: boolean;
}

function portsOf(listeners: PolicyListener[], protocol: string): number[] {
  const ports = listeners.filter((l) => l.protocol === protocol).flatMap((l) => l.ports);
  return [...new Set(ports)].sort((a, b) => a - b);
}

/**
 * Every mail protocol the server speaks, in one place, with what the switches
 * do to each. The locked set comes from the server, so unlocking later is a
 * server change and no admin release (LP-21).
 *
 * A protocol that is off shows the ports it closed (`savedListeners`); one
 * that is on, the ports turning it off would close (`wouldClose`).
 */
export function protocolRows(policy: ProtocolPolicy): ProtocolRow[] {
  const locked = new Set(policy.lockedProtocols.map((p) => p.toLowerCase()));
  const legacy: ProtocolRow[] = SWITCHED.map((key) => {
    const off = policy.switches[key] === 'disabled';
    return {
      key,
      label: PROTOCOL_LABELS[key] ?? key,
      state: 'closes',
      ports: portsOf(off ? policy.savedListeners : policy.wouldClose, key),
      off,
    };
  });
  const smtpLocked = locked.has('smtp');
  const allOff = policy.legacyProtocols === 'disabled';
  return [
    ...legacy,
    {
      key: 'submission',
      label: 'SMTP submission',
      // Locked submission keeps its ports; sign-in over them is refused
      // instead, and only with all three protocols off.
      state: smtpLocked ? 'locked' : policy.closeSubmission ? 'closes' : 'refused',
      ports: smtpLocked ? [] : portsOf(allOff ? policy.savedListeners : policy.wouldClose, 'smtp'),
    },
    // Incoming mail and JMAP are never the switch's to close (LP-3, "Not affected, ever").
    { key: 'smtp', label: 'SMTP (incoming mail)', state: 'locked', ports: [] },
    { key: 'jmap', label: 'JMAP (inbuxa webmail)', state: 'locked', ports: [] },
  ];
}

/** Whether the typed confirmation matches (LP-17). Exact: no trimming, no case folding. */
export function phraseMatches(typed: string): boolean {
  return typed === CONFIRM_PHRASE;
}

export function describeListener(l: PolicyListener): string {
  return l.ports.length > 0 ? `${l.name} (${l.ports.join(', ')})` : l.name;
}

// ---- A tenant's switch: inbuxa:TenantProtocolPolicy (LP-9 to LP-14) ----

const TENANT_OBJECT = 'inbuxa:TenantProtocolPolicy';

export interface TenantPolicy {
  /** The tenant's id, which is also the policy's. */
  id: string;
  /** The kill-all: `disabled` only when all three protocols are off. */
  legacyProtocols: Switch;
  switches: Switches;
  /** Milliseconds since the epoch. */
  changedAt: number | null;
  /** The tenant's own people who used a legacy mail app lately (LP-15), or null from an older server. */
  recentLegacyUse: RecentUse[] | null;
}

export function parseTenantPolicy(raw: Record<string, unknown>): TenantPolicy {
  return {
    id: typeof raw.id === 'string' ? raw.id : '',
    legacyProtocols: raw.legacyProtocols === 'disabled' ? 'disabled' : 'enabled',
    switches: parseSwitches(raw),
    changedAt: typeof raw.changedAt === 'number' ? raw.changedAt : null,
    recentLegacyUse: Array.isArray(raw.recentLegacyUse) ? parseRecent(raw.recentLegacyUse) : null,
  };
}

/**
 * A tenant's switch. With no id, the caller's own tenant's -- which is how a
 * tenant administrator reads it; a server administrator names the tenant.
 */
export async function fetchTenantPolicy(tenantId: string | null, signal?: AbortSignal): Promise<TenantPolicy> {
  const accountId = getAccountId('x:Domain');
  const responses = await jmapRequest(
    [[`${TENANT_OBJECT}/get`, { accountId, ids: tenantId ? [tenantId] : null }, '0']],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${TENANT_OBJECT}/get`) {
    const type = (result as { type?: string } | undefined)?.type;
    if (type === 'unknownMethod' || type === 'unknownCapability') throw new PolicyUnavailable(type);
    throw new Error((result as { description?: string } | undefined)?.description ?? type ?? 'Request failed');
  }
  const list = (result as { list?: Record<string, unknown>[] }).list ?? [];
  // A tenant admin's /get with no ids holds exactly its own tenant's.
  if (!list[0] || (!tenantId && list.length !== 1)) throw new PolicyUnavailable('notFound');
  return parseTenantPolicy(list[0]);
}

/**
 * Turns a tenant's switches. The server refuses turning a protocol on while
 * its own switch for it is off (LP-9), and says which.
 */
export async function updateTenantPolicy(tenantId: string, update: SwitchUpdate): Promise<void> {
  const accountId = getAccountId('x:Domain');
  const responses = await jmapRequest(
    [[`${TENANT_OBJECT}/set`, { accountId, update: { [tenantId]: update } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${TENANT_OBJECT}/set`) {
    throw new Error((result as { description?: string } | undefined)?.description ?? 'Request failed');
  }
  const failed = (result as { notUpdated?: Record<string, JmapSetError> | null }).notUpdated?.[tenantId];
  if (failed) throw new Error(failed.description ?? failed.type);
}
