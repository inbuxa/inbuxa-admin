/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:MailRule` and `inbuxa:HeldMessage` over JMAP
 * (dlp-and-mail-flow-rules spec, §2.2, §2.6). The pages draw from here.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { Kind, Rule } from './model';

const CAPABILITY = 'urn:inbuxa:jmap';

/** The server has no mail rules (an older server). */
export class RulesUnavailable extends Error {}

function failure(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new RulesUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

async function call(
  method: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const responses = await jmapRequest([[method, { accountId: getAccountId('x:Account'), ...args }, '0']], signal, [
    CAPABILITY,
  ]);
  const [name, result] = responses[0] ?? [];
  if (name !== method) throw failure(name, result);
  return result as Record<string, unknown>;
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

// --- Rules ----------------------------------------------------------------

/** The rules this person may see, in the order they run. */
export async function fetchRules(kind: Kind, signal?: AbortSignal): Promise<Rule[]> {
  const result = await call('inbuxa:MailRule/get', { ids: null }, signal);
  return ((result.list as Rule[] | undefined) ?? []).filter((rule) => rule.kind === kind);
}

/** What the server stores: everything but what it sets itself. */
function toServer(rule: Rule): Record<string, unknown> {
  return {
    name: rule.name,
    description: rule.description,
    kind: rule.kind,
    enabled: rule.enabled,
    priority: rule.priority,
    direction: rule.direction,
    conditions: rule.conditions,
    exceptions: rule.exceptions,
    actions: rule.actions,
    stopProcessing: rule.stopProcessing,
  };
}

export async function saveRule(rule: Rule, reason?: string): Promise<string | undefined> {
  const args: Record<string, unknown> = reason?.trim() ? { reason: reason.trim() } : {};
  if (rule.id) {
    const result = await call('inbuxa:MailRule/set', { ...args, update: { [rule.id]: toServer(rule) } });
    const failed = setFailure(result, 'notUpdated', rule.id);
    if (failed) throw failed;
    return rule.id;
  }
  const result = await call('inbuxa:MailRule/set', { ...args, create: { r: toServer(rule) } });
  const failed = setFailure(result, 'notCreated', 'r');
  if (failed) throw failed;
  return (result.created as Record<string, { id?: string }> | undefined)?.r?.id;
}

export async function setRuleEnabled(rule: Rule, enabled: boolean): Promise<void> {
  if (!rule.id) return;
  const result = await call('inbuxa:MailRule/set', { update: { [rule.id]: { enabled } } });
  const failed = setFailure(result, 'notUpdated', rule.id);
  if (failed) throw failed;
}

export async function deleteRule(id: string): Promise<void> {
  const result = await call('inbuxa:MailRule/set', { destroy: [id] });
  const failed = setFailure(result, 'notDestroyed', id);
  if (failed) throw failed;
}

// --- Held mail --------------------------------------------------------------

export interface HeldMessage {
  id: string;
  sender: string;
  recipients: string[];
  subject: string;
  size: number;
  rules: { name: string; notice: string }[];
  counts: { detector: string; count: number }[];
  heldAt: string;
  expiresAt: string;
}

export async function fetchHeld(signal?: AbortSignal): Promise<HeldMessage[]> {
  const result = await call('inbuxa:HeldMessage/get', { ids: null }, signal);
  return (result.list as HeldMessage[] | undefined) ?? [];
}

/** The message's text. The server records every read. */
export async function fetchPreview(id: string): Promise<string> {
  const result = await call('inbuxa:HeldMessage/get', { ids: [id], properties: ['id', 'preview'] });
  const item = (result.list as { preview?: string | null }[] | undefined)?.[0];
  return item?.preview ?? '';
}

export async function decideHeld(
  id: string,
  decision: 'release' | 'reject',
  reason: string,
  note?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { decision };
  if (decision === 'reject' && note?.trim()) patch.note = note.trim();
  const result = await call('inbuxa:HeldMessage/set', { reason: reason.trim(), update: { [id]: patch } });
  const failed = setFailure(result, 'notUpdated', id);
  if (failed) throw failed;
}

// --- Settings ---------------------------------------------------------------

/** How many days held mail waits for a reviewer (1 to 90). */
export async function fetchKeepHeldDays(signal?: AbortSignal): Promise<number> {
  const result = await call('inbuxa:DlpSettings/get', { ids: null }, signal);
  return (result.list as { keepHeldDays?: number }[] | undefined)?.[0]?.keepHeldDays ?? 7;
}

export async function saveKeepHeldDays(days: number): Promise<void> {
  const result = await call('inbuxa:DlpSettings/set', { update: { singleton: { keepHeldDays: days } } });
  const failed = setFailure(result, 'notUpdated', 'singleton');
  if (failed) throw failed;
}
