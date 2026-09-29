/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The records a domain needs, read from the zone text the server builds for
 * it (the domain's `dnsZoneFile`), and sorted into the groups the server's
 * `publishRecords` setting switches on and off.
 */

export type RecordKind =
  | 'mx'
  | 'spf'
  | 'dkim'
  | 'dmarc'
  | 'mtaSts'
  | 'tlsRpt'
  | 'srv'
  | 'autoConfig'
  | 'autoConfigLegacy'
  | 'autoDiscover'
  | 'caa'
  | 'tlsa';

export interface ZoneRecord {
  /** Owner name, without the trailing dot. */
  name: string;
  type: string;
  /** The record data as the zone text has it. */
  value: string;
  kind: RecordKind;
}

/** Split a zone line into fields, keeping quoted strings whole. */
function fields(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? `"${m[1]}"` : m[2]);
  return out;
}

const CLASSES = new Set(['IN', 'CH', 'HS']);

function kindOf(name: string, type: string, value: string): RecordKind | null {
  const n = name.toLowerCase();
  switch (type) {
    case 'MX':
      return 'mx';
    case 'SRV':
      return 'srv';
    case 'CAA':
      return 'caa';
    case 'TLSA':
      return 'tlsa';
  }
  if (n.includes('._domainkey.')) return 'dkim';
  if (n.startsWith('_dmarc.')) return 'dmarc';
  if (n.startsWith('mta-sts.') || n.startsWith('_mta-sts.')) return 'mtaSts';
  if (n.startsWith('_smtp._tls.')) return 'tlsRpt';
  if (n.startsWith('ua-auto-config.') || n.startsWith('_ua-auto-config.')) return 'autoConfig';
  if (n.startsWith('autoconfig.')) return 'autoConfigLegacy';
  if (n.startsWith('autodiscover.')) return 'autoDiscover';
  if (type === 'TXT' && /^"?v=spf1\b/i.test(value)) return 'spf';
  return null;
}

/** The text with the quoted strings blanked, so parentheses inside them don't count. */
function unquoted(line: string): string {
  return line.replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

/**
 * Join the lines a record spans. The server writes a TXT value longer than
 * 255 bytes the way BIND does, as quoted chunks inside parentheses on lines
 * of their own:
 *
 *     sel._domainkey.example.com. IN TXT (
 *         "v=DKIM1; k=rsa; p=MIIB…"
 *         "…IDAQAB"
 *     )
 *
 * Read a line at a time, the record was "(" and the DKIM key never matched
 * what DNS returns, so every domain with an RSA key showed as missing it.
 */
function logicalLines(text: string): string[] {
  const out: string[] = [];
  let pending: string | null = null;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (pending !== null) {
      pending += ` ${line}`;
      if (unquoted(line).includes(')')) {
        out.push(pending);
        pending = null;
      }
      continue;
    }
    const bare = unquoted(line);
    if (bare.includes('(') && !bare.includes(')')) pending = line;
    else out.push(line);
  }
  if (pending !== null) out.push(pending);
  // The parentheses only group lines; the record doesn't contain them.
  return out.map((l) => {
    const bare = unquoted(l);
    if (!bare.includes('(')) return l;
    let result = '';
    let inQuote = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (c === '"' && l[i - 1] !== '\\') inQuote = !inQuote;
      if (!inQuote && (c === '(' || c === ')')) continue;
      result += c;
    }
    return result.replace(/\s+/g, ' ').trim();
  });
}

/** Parse the zone text. Lines it can't place are left out, not guessed at. */
export function parseZone(text: string | null | undefined): ZoneRecord[] {
  const out: ZoneRecord[] = [];
  for (const raw of logicalLines(text ?? '')) {
    const line = raw.trim();
    if (!line || line.startsWith(';')) continue;
    const f = fields(line);
    if (f.length < 3) continue;
    const name = f[0].replace(/\.$/, '');
    let i = 1;
    // Optional TTL and class, in either order.
    for (let k = 0; k < 2 && i < f.length; k++) {
      if (/^\d+$/.test(f[i]) || CLASSES.has(f[i].toUpperCase())) i++;
    }
    const type = (f[i] ?? '').toUpperCase();
    const value = f.slice(i + 1).join(' ');
    if (!type || !value) continue;
    const kind = kindOf(name, type, value);
    if (kind) out.push({ name, type, value, kind });
  }
  return out;
}

/**
 * One value in a comparable form: TXT strings joined (resolvers split long
 * ones), quotes, case and trailing dots dropped, spaces collapsed.
 */
export function normalizeValue(type: string, value: string): string {
  let v = value.trim();
  if (type === 'TXT') {
    const parts = [...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    v = parts.length > 0 ? parts.join('') : v;
    return v.replace(/\\"/g, '"').replace(/\s+/g, ' ').trim();
  }
  v = v.replace(/"/g, '').replace(/\s+/g, ' ').toLowerCase();
  return v
    .split(' ')
    .map((p) => p.replace(/\.$/, ''))
    .join(' ');
}

/** The name as DNS host panels ask for it: relative to the zone, "@" for the zone itself. */
export function hostLabel(name: string, zone: string): string {
  const n = name.toLowerCase().replace(/\.$/, '');
  const z = zone.toLowerCase().replace(/\.$/, '');
  if (n === z) return '@';
  return n.endsWith(`.${z}`) ? n.slice(0, -(z.length + 1)) : n;
}

/**
 * The record's value the way host panels want it pasted: TXT without the
 * quotes (long ones joined back together), and MX with its priority apart,
 * since nearly every panel has a separate box for it.
 */
export function pasteParts(r: ZoneRecord): { value: string; priority?: string } {
  const v = r.value.trim();
  if (r.type === 'TXT') {
    const parts = [...v.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    return { value: parts.length ? parts.join('') : v };
  }
  if (r.type === 'MX') {
    const [priority, ...rest] = v.split(/\s+/);
    return { value: rest.join(' ').replace(/\.$/, ''), priority };
  }
  return { value: v.replace(/\.$/, '') };
}

/**
 * A publishing failure, boiled down. The server reports each record's error
 * in full, so one bad credential repeats the same provider message a dozen
 * times; keep each distinct message once, innermost cause first.
 */
export function summarizeFailure(reason: string | undefined): { messages: string[]; records: number } {
  const text = reason ?? '';
  const records = (text.match(/Failed to set DNS RRSet for /g) ?? []).length;
  const found = [...text.matchAll(/"message"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
  // Nested error chains list the cause last; show the most specific first.
  const messages = [...new Set(found.reverse())];
  if (messages.length === 0 && text) {
    const first = text.split(/;\s*/)[0].replace(/^Failed to set DNS RRSet for \S+: /, '');
    messages.push(first.length > 200 ? `${first.slice(0, 200)}…` : first);
  }
  return { messages, records };
}
