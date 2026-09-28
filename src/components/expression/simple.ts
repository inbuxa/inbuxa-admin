/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: expression fields in plain words (settings-reorg, expression simple
 * mode). The server's schema says, for each expression field, which constants
 * it may evaluate to and which variables its conditions may read. With that,
 * a value that is one of the constants becomes a choice ("Relaxed", "Off"),
 * and a condition of the form `variable op literal` becomes three controls
 * ("Port on this server" "is" "25"). Anything else stays text: the simple
 * form never rewrites what it can't read.
 */

import { humanize } from '@/lib/humanize';

export interface ExpressionHints {
  constants: string[];
  variables: string[];
}

export type Operator = '==' | '!=' | '>' | '<' | '>=' | '<=';
export const OPERATORS: Operator[] = ['==', '!=', '>', '<', '>=', '<='];

export interface SimpleCondition {
  variable: string;
  op: Operator;
  /** The literal as a person types it: no quotes. */
  value: string;
}

const CONSTANT_LABELS: Record<string, string> = {
  relaxed: 'Relaxed',
  strict: 'Strict',
  disable: 'Off',
  optional: 'Optional',
  require: 'Required',
  ipv4_only: 'IPv4 only',
  ipv6_only: 'IPv6 only',
  ipv6_then_ipv4: 'IPv6, then IPv4',
  ipv4_then_ipv6: 'IPv4, then IPv6',
  hourly: 'Hourly',
  daily: 'Daily',
  weekly: 'Weekly',
  login: 'LOGIN',
  plain: 'PLAIN',
  xoauth2: 'XOAUTH2',
  oauthbearer: 'OAUTHBEARER',
  mixer: 'MIXER',
  stanag4406: 'STANAG 4406',
  nsep: 'NSEP',
};

const VARIABLE_LABELS: Record<string, string> = {
  local_port: 'Port on this server',
  local_ip: 'IP on this server',
  remote_ip: 'Remote IP',
  remote_port: 'Remote port',
  'remote_ip.ptr': 'Remote host name (PTR)',
  listener: 'Listener',
  protocol: 'Protocol',
  is_tls: 'Connection uses TLS',
  authenticated_as: 'Signed-in account',
  sender: 'Sender',
  sender_domain: 'Sender’s domain',
  rcpt: 'Recipient',
  rcpt_domain: 'Recipient’s domain',
  recipients: 'Recipients',
  helo_domain: 'Greeting name (EHLO)',
  asn: 'Network (ASN)',
  country: 'Country',
  priority: 'Priority',
  size: 'Message size',
  mx: 'Mail exchanger',
  host: 'Host',
  domain: 'Domain',
  ip: 'IP address',
  is_v4: 'Address is IPv4',
  is_v6: 'Address is IPv6',
  reverse_ip: 'Reverse IP',
  queue_name: 'Queue',
  queue_age: 'Time in queue',
  retry_num: 'Retries so far',
  notify_num: 'Notices sent so far',
  last_status: 'Last status',
  last_error: 'Last error',
  expires_in: 'Time until expiry',
  source: 'Source',
  received_from_ip: 'Received from IP',
  received_via_port: 'Received on port',
  env_from: 'Envelope sender',
  env_to: 'Envelope recipient',
};

const OPERATOR_LABELS: Record<Operator, string> = {
  '==': 'is',
  '!=': 'is not',
  '>': 'is more than',
  '<': 'is less than',
  '>=': 'is at least',
  '<=': 'is at most',
};

export function constantLabel(name: string): string {
  return CONSTANT_LABELS[name] ?? humanize(name);
}

export function variableLabel(name: string): string {
  return VARIABLE_LABELS[name] ?? humanize(name);
}

export function operatorLabel(op: Operator): string {
  return OPERATOR_LABELS[op];
}

const BARE_LITERAL = /^(?:-?\d+(?:\.\d+)?(?:ms|s|m|h|d)?|true|false)$/;

/** A literal from the expression, unquoted for display; null if it isn't a plain literal. */
function readLiteral(raw: string): string | null {
  const s = raw.trim();
  const quoted = /^(['"])((?:(?!\1)[^\\]|\\.)*)\1$/.exec(s);
  if (quoted) return quoted[2].replace(/\\(.)/g, '$1');
  return BARE_LITERAL.test(s) ? s : null;
}

/** A value as the expression needs it: numbers, durations and booleans bare, everything else quoted. */
export function writeLiteral(value: string): string {
  const s = value.trim();
  if (BARE_LITERAL.test(s)) return s;
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** `local_port == 25` → {local_port, ==, 25}; null for anything more than one comparison. */
export function parseCondition(text: string, variables: string[]): SimpleCondition | null {
  const m = /^\s*([a-z_][a-z0-9_.]*)\s*(==|!=|>=|<=|>|<)\s*(.+?)\s*$/.exec(text);
  if (!m || !variables.includes(m[1])) return null;
  const value = readLiteral(m[3]);
  if (value === null) return null;
  return { variable: m[1], op: m[2] as Operator, value };
}

export function formatCondition(c: SimpleCondition): string {
  return `${c.variable} ${c.op} ${writeLiteral(c.value)}`;
}

/** A value (THEN / ELSE) in words: a constant's label, a literal unquoted, or null if it's an expression. */
export function describeValue(text: string, hints: ExpressionHints): string | null {
  const s = text.trim();
  if (hints.constants.includes(s)) return constantLabel(s);
  return readLiteral(s);
}

/** A label inside a sentence: "Remote port" → "remote port", but "IP on this server" stays. */
function midSentence(label: string): string {
  return /^[A-Z][a-z]/.test(label) ? label[0].toLowerCase() + label.slice(1) : label;
}

export function describeCondition(text: string, hints: ExpressionHints): string | null {
  const c = parseCondition(text, hints.variables);
  return c ? `${midSentence(variableLabel(c.variable))} ${operatorLabel(c.op)} ${c.value}` : null;
}

/**
 * The whole expression in one sentence, when every part of it can be said
 * in words: "Relaxed when port on this server is 25; otherwise Off".
 */
export function summarize(
  value: { match: Record<string, { if: string; then: string }>; else: string },
  hints: ExpressionHints,
): string | null {
  const rules = Object.values(value.match);
  const otherwise = describeValue(value.else, hints);
  if (otherwise === null) return null;
  if (rules.length === 0) return otherwise;
  const parts: string[] = [];
  for (const rule of rules) {
    const when = describeCondition(rule.if, hints);
    const then = describeValue(rule.then, hints);
    if (when === null || then === null) return null;
    parts.push(`${then} when ${when}`);
  }
  return `${parts.join('; ')}; otherwise ${midSentence(otherwise)}`;
}
