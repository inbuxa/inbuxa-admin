/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: ordering a certificate with names you choose (#167).
 *
 * The server orders certificates for domains: each automatic domain gets one
 * certificate, for its own hostname list when it has one
 * (common/src/network/acme/order.rs). So a certificate for chosen names is
 * that list on the domain the names belong to, and "order again" is the
 * domain's renewal task told to run now.
 */

export interface DomainLike {
  id: string;
  name: string;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

/** Names typed one per line, or separated by commas or spaces, lowercased and without duplicates. */
export function parseNames(text: string): string[] {
  const names = text
    .split(/[\s,]+/)
    .map((n) => n.trim().toLowerCase().replace(/\.$/, ''))
    .filter(Boolean);
  return [...new Set(names)];
}

/** A host name, or a wildcard in its first label only (`*.example.com`). */
export function isValidName(name: string): boolean {
  const labels = name.split('.');
  if (labels.length < 2 || name.length > 253) return false;
  return labels.every((l, i) => (i === 0 && l === '*' ? labels.length > 2 : LABEL.test(l)));
}

export const isWildcard = (name: string) => name.startsWith('*.');

/** Whether a name is the domain itself or under it. A wildcard counts by what follows `*.`. */
export function nameInDomain(name: string, domain: string): boolean {
  const n = name.toLowerCase().replace(/^\*\./, '');
  const d = domain.toLowerCase();
  return n === d || n.endsWith(`.${d}`);
}

/** The domains every one of these names belongs to, the closest (longest) first. */
export function domainsFor<T extends DomainLike>(names: string[], domains: T[]): T[] {
  if (names.length === 0) return [];
  return domains
    .filter((d) => names.every((n) => nameInDomain(n, d.name)))
    .sort((a, b) => b.name.length - a.name.length);
}

/**
 * A domain to add when none of yours covers the names: the longest ending
 * they all share, kept to at least two labels. A guess the admin can edit,
 * since `example.co.uk` and `mail.example.com` look the same from here.
 */
export function suggestDomain(names: string[]): string {
  const split = names.map((n) => n.replace(/^\*\./, '').split('.').reverse());
  if (split.length === 0) return '';
  const shared: string[] = [];
  for (let i = 0; ; i++) {
    const label = split[0][i];
    if (label === undefined || split.some((s) => s[i] !== label)) break;
    shared.push(label);
  }
  if (shared.length < 2) return '';
  // One host on its own (mail.example.com) suggests the domain it's under.
  const single = names.length === 1 && !isWildcard(names[0]) && shared.length > 2;
  return (single ? shared.slice(0, -1) : shared).reverse().join('.');
}

/** The domain's own hostname list as the server stores it: names under it as written. */
export function hostnamesFor(names: string[]): Record<string, true> {
  return Object.fromEntries(names.map((n) => [n, true as const]));
}

export const sameNames = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');

export type RenewalState =
  | { kind: 'none' }
  | { kind: 'pending'; due: string | null }
  | { kind: 'retry'; due: string | null; reason: string }
  | { kind: 'failed'; at: string | null; reason: string };

/** What a domain's renewal task says, from its `status`. */
export function renewalState(task: Record<string, unknown> | undefined): RenewalState {
  if (!task) return { kind: 'none' };
  const status = (task.status ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  switch (status['@type']) {
    case 'Failed':
      return { kind: 'failed', at: str(status.failedAt), reason: String(status.failureReason ?? '') };
    case 'Retry':
      return { kind: 'retry', due: str(status.due), reason: String(status.failureReason ?? '') };
    default:
      return { kind: 'pending', due: str(status.due) ?? str(task.due) };
  }
}

/** Order again is only offered when it would order something: after a failure, or with nothing queued. */
export const canOrderAgain = (s: RenewalState) => s.kind === 'failed' || s.kind === 'retry' || s.kind === 'none';

/** The server's date-time form, without the milliseconds `toISOString` adds. */
export function utcNow(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** A task status that runs it straight away. The server sets `createdAt` itself. */
export function runNowStatus(now = new Date()) {
  return { '@type': 'Pending', due: utcNow(now) };
}

/**
 * The `x:Task/set` arguments for Order again. A queued task is told to run
 * now rather than a second one created: each renewal queues the next, so two
 * would keep renewing for good (#290).
 */
export function orderAgainSet(domainId: string, taskId: string | undefined, now = new Date()) {
  return taskId
    ? { update: { [taskId]: { status: runNowStatus(now) } } }
    : { create: { renew: { '@type': 'AcmeRenewal', domainId, status: runNowStatus(now) } } };
}
