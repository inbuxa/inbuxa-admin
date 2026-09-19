/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Words that stay in capitals, or in their own casing, when a name is spelled out. */
const SPECIAL: Record<string, string> = {
  id: 'ID',
  ids: 'IDs',
  url: 'URL',
  urls: 'URLs',
  uri: 'URI',
  uris: 'URIs',
  tls: 'TLS',
  dns: 'DNS',
  mx: 'MX',
  ip: 'IP',
  ips: 'IPs',
  api: 'API',
  http: 'HTTP',
  https: 'HTTPS',
  smtp: 'SMTP',
  imap: 'IMAP',
  pop3: 'POP3',
  jmap: 'JMAP',
  dkim: 'DKIM',
  spf: 'SPF',
  dmarc: 'DMARC',
  arc: 'ARC',
  acme: 'ACME',
  ldap: 'LDAP',
  sql: 'SQL',
  ttl: 'TTL',
  oauth: 'OAuth',
  oidc: 'OIDC',
  sni: 'SNI',
  mta: 'MTA',
  dav: 'DAV',
  cal: 'Cal',
  ai: 'AI',
  llm: 'LLM',
  otp: 'OTP',
  totp: 'TOTP',
  s3: 'S3',
};

/**
 * `defaultCertificateId` → "Default certificate ID", `x:SystemSettings` →
 * "System settings". For names the server gives no label of its own: a
 * person reads words, not identifiers.
 */
export function humanize(name: string): string {
  const bare = name.replace(/^x:/, '').split('/').pop() ?? name;
  const words = bare
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words
    .map((w, i) => {
      const special = SPECIAL[w.toLowerCase()];
      if (special) return special;
      const lower = w.toLowerCase();
      return i === 0 ? lower[0].toUpperCase() + lower.slice(1) : lower;
    })
    .join(' ');
}
