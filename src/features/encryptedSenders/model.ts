/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Mail flow › Sending › Encrypted senders (admin #187). Addresses and
 * domains whose outgoing mail is only ever sent encrypted.
 *
 * The server picks a TLS strategy for each delivery from the outbound
 * strategy's `tls` expression, and that expression can see the envelope
 * sender. So each entry here is one row, `sender == 'a@b'` or
 * `sender_domain == 'b'`, pointing at a strategy of this page's own that
 * requires STARTTLS. The rows always go first: the stock expression has a
 * retry row (`retry_num > 0 && last_error == 'tls'` → `'invalid-tls'`), and a
 * sender row below it would fall back to the lenient strategy on the first
 * retry. Every other row is kept, in order, exactly as it was.
 *
 * What the server does (inbuxa-server tests/src/smtp/outbound/per_sender_tls.rs):
 * no STARTTLS offered → the message bounces at once; STARTTLS offered but
 * the handshake fails → temporary, retried until the queue gives up. It is
 * never sent in plain text.
 *
 * The server stores the envelope sender in lowercase, so entries are too.
 */

export const SENDER_TLS = 'sender-tls';

export type Rule = { if: string; then: string };
export type Expr = { match: Record<string, Rule>; else: string };

export type Entry = { kind: 'address' | 'domain'; value: string };

export interface TlsStrategyInfo {
  id: string;
  name: string;
  allowInvalidCerts?: boolean;
  startTls?: string;
}

export interface Current {
  tls: Expr;
  tlsStrategies: TlsStrategyInfo[];
}

export interface Plan {
  tls?: Expr;
  tlsCreate?: Record<string, unknown>;
  tlsUpdate?: { id: string; patch: Record<string, unknown> };
}

export function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function unquote(v: string): string | null {
  const m = /^\s*'((?:[^'\\]|\\.)*)'\s*$/.exec(v) ?? /^\s*"((?:[^"\\]|\\.)*)"\s*$/.exec(v);
  return m ? m[1].replace(/\\(.)/g, '$1') : null;
}

const ROW = /^\s*(sender|sender_domain)\s*==\s*('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")\s*$/;

/** The entry a row stands for, or null when it isn't one of this page's rows. */
export function entryOf(rule: Rule): Entry | null {
  if (unquote(rule.then) !== SENDER_TLS) return null;
  const m = ROW.exec(rule.if);
  if (!m) return null;
  const value = unquote(m[2]);
  if (!value) return null;
  return { kind: m[1] === 'sender' ? 'address' : 'domain', value };
}

function rows(expr: Expr): Rule[] {
  return Object.entries(expr.match)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, r]) => r);
}

export function entries(cur: Current): Entry[] {
  return rows(cur.tls).flatMap((r) => {
    const e = entryOf(r);
    return e ? [e] : [];
  });
}

/** Rows this page doesn't own that still look at the sender, which it leaves alone. */
export function otherSenderRules(cur: Current): Rule[] {
  return rows(cur.tls).filter((r) => !entryOf(r) && /\bsender(_domain)?\b/.test(r.if));
}

/** Whether this page's rows are already above every other row. */
export function rowsFirst(cur: Current): boolean {
  const all = rows(cur.tls);
  const firstOther = all.findIndex((r) => !entryOf(r));
  return firstOther === -1 || all.slice(firstOther).every((r) => !entryOf(r));
}

export function strategy(cur: Current): TlsStrategyInfo | undefined {
  return cur.tlsStrategies.find((s) => s.name === SENDER_TLS);
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;

function validDomain(d: string): boolean {
  const labels = d.split('.');
  return labels.length >= 2 && labels.every((l) => LABEL.test(l) || /^xn--[a-z0-9-]+$/.test(l));
}

/**
 * What someone typed: `a@b.org` is one address, `b.org` or `@b.org` a whole
 * domain. Lowercased. Null when it's neither.
 */
export function parseEntry(input: string): Entry | null {
  const v = input.trim().toLowerCase();
  if (!v || /\s/.test(v)) return null;
  if (v.startsWith('@')) return validDomain(v.slice(1)) ? { kind: 'domain', value: v.slice(1) } : null;
  const at = v.lastIndexOf('@');
  if (at === -1) return validDomain(v) ? { kind: 'domain', value: v } : null;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (!local || /[<>"'\\,;]/.test(local) || !validDomain(domain)) return null;
  return { kind: 'address', value: v };
}

export function ruleFor(e: Entry): Rule {
  return {
    if: `${e.kind === 'address' ? 'sender' : 'sender_domain'} == ${quote(e.value)}`,
    then: quote(SENDER_TLS),
  };
}

function sameEntry(a: Entry, b: Entry): boolean {
  return a.kind === b.kind && a.value === b.value;
}

function renumber(list: Rule[]): Record<string, Rule> {
  return Object.fromEntries(list.map((r, i) => [String(i), r]));
}

/** The TLS rule with exactly these entries, first, and every other row after them. */
export function withEntries(cur: Current, list: Entry[]): Expr {
  const others = rows(cur.tls).filter((r) => !entryOf(r));
  const unique = list.filter((e, i) => list.findIndex((x) => sameEntry(x, e)) === i);
  return { match: renumber([...unique.map(ruleFor), ...others]), else: cur.tls.else };
}

export const NEW_STRATEGY = {
  name: SENDER_TLS,
  description: 'Encryption required for the senders on the Encrypted senders page',
  startTls: 'require',
  dane: 'optional',
  mtaSts: 'optional',
  allowInvalidCerts: false,
};

export function planAdd(cur: Current, e: Entry): Plan {
  const list = entries(cur);
  const out: Plan = {};
  if (!strategy(cur)) out.tlsCreate = { ...NEW_STRATEGY };
  if (!list.some((x) => sameEntry(x, e)) || !rowsFirst(cur)) out.tls = withEntries(cur, [...list, e]);
  return out;
}

export function planRemove(cur: Current, e: Entry): Plan {
  const list = entries(cur);
  if (!list.some((x) => sameEntry(x, e))) return {};
  return {
    tls: withEntries(
      cur,
      list.filter((x) => !sameEntry(x, e)),
    ),
  };
}

/** Moves this page's rows back above the others, when someone reordered them. */
export function planReorder(cur: Current): Plan {
  return rowsFirst(cur) ? {} : { tls: withEntries(cur, entries(cur)) };
}

/** True when this page's strategy exists but someone set STARTTLS to less than required. */
export function strategyWeakened(cur: Current): boolean {
  const s = strategy(cur);
  return !!s && s.startTls !== undefined && s.startTls !== 'require';
}

export function planRequire(cur: Current): Plan {
  const s = strategy(cur);
  return s && strategyWeakened(cur) ? { tlsUpdate: { id: s.id, patch: { startTls: 'require' } } } : {};
}

export function planCertificates(cur: Current, allowInvalid: boolean): Plan {
  const s = strategy(cur);
  if (!s) return { tlsCreate: { ...NEW_STRATEGY, allowInvalidCerts: allowInvalid } };
  if (Boolean(s.allowInvalidCerts) === allowInvalid) return {};
  return { tlsUpdate: { id: s.id, patch: { allowInvalidCerts: allowInvalid } } };
}
