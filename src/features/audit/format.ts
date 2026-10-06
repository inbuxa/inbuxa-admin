/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** INBUXA: how audit records read on screen (audit-hold-lock spec, AU-4). */

/** Words the registry spells in camel case that read as acronyms. */
const ACRONYMS: Record<string, string> = {
  Oauth: 'OAuth',
  Dkim: 'DKIM',
  Dmarc: 'DMARC',
  Dns: 'DNS',
  Dnsbl: 'DNSBL',
  Mta: 'MTA',
  Acme: 'ACME',
  Ip: 'IP',
  Ai: 'AI',
  Llm: 'LLM',
  Tls: 'TLS',
  Spf: 'SPF',
  Arf: 'ARF',
  Dsn: 'DSN',
  Http: 'HTTP',
  Imap: 'IMAP',
  Jmap: 'JMAP',
  Oidc: 'OIDC',
  Sts: 'STS',
  Api: 'API',
  Scim: 'SCIM',
};

/** `x:DkimSignature` reads as "DKIM signature"; fork objects lose their prefix too. */
export function targetKindLabel(kind: string): string {
  if (kind === 'account') return 'Account';
  // Exports and checks act on the log itself
  if (kind === 'inbuxa:AuditEvent') return 'Audit log';
  const name = kind.replace(/^(x|inbuxa):/, '').replace('OAuth', 'Oauth');
  if (!name) return '';
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(' ')
    .map((word, i) => ACRONYMS[word] ?? (i === 0 ? word : word.toLowerCase()))
    .join(' ');
}

/** One side of a change: absent reads as a dash, text as itself, anything else as JSON. */
export function formatValue(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/** What a record names its target by: a singleton's id says nothing. */
export function targetName(target: { name?: string; id?: string }): string {
  if (target.name) return target.name;
  if (target.id && target.id !== 'singleton') return target.id;
  return '';
}
