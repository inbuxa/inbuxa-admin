/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { hostLabel, normalizeValue, parseZone, pasteParts, summarizeFailure } from './zone';

const ZONE = `mail.example.com. IN TXT "v=spf1 a -all"
example.com. IN TXT "v=spf1 mx -all"
example.com. IN MX 10 mail.example.com.
_dmarc.example.com. IN TXT "v=DMARC1; p=reject; rua=mailto:postmaster@example.com"
s1._domainkey.example.com. 300 IN TXT "v=DKIM1; k=ed25519; p=abc"
_jmap._tcp.example.com. IN SRV 0 1 443 mail.example.com.
mta-sts.example.com. IN CNAME mail.example.com.
_mta-sts.example.com. IN TXT "v=STSv1; id=1"
_smtp._tls.example.com. IN TXT "v=TLSRPTv1; rua=mailto:postmaster@example.com"
ua-auto-config.example.com. IN CNAME mail.example.com.
autoconfig.example.com. IN CNAME mail.example.com.
autodiscover.example.com. IN CNAME mail.example.com.
example.com. IN CAA 0 issue "letsencrypt.org"
_25._tcp.mail.example.com. IN TLSA 3 1 1 abcdef
; a comment
www.example.com. IN A 192.0.2.1`;

describe('parseZone', () => {
  const records = parseZone(ZONE);
  const kind = (name: string, type: string) => records.find((r) => r.name === name && r.type === type)?.kind;

  it('sorts every record the server owns into its group', () => {
    expect(kind('example.com', 'MX')).toBe('mx');
    expect(kind('mail.example.com', 'TXT')).toBe('spf');
    expect(kind('example.com', 'TXT')).toBe('spf');
    expect(kind('_dmarc.example.com', 'TXT')).toBe('dmarc');
    expect(kind('s1._domainkey.example.com', 'TXT')).toBe('dkim');
    expect(kind('_jmap._tcp.example.com', 'SRV')).toBe('srv');
    expect(kind('mta-sts.example.com', 'CNAME')).toBe('mtaSts');
    expect(kind('_mta-sts.example.com', 'TXT')).toBe('mtaSts');
    expect(kind('_smtp._tls.example.com', 'TXT')).toBe('tlsRpt');
    expect(kind('ua-auto-config.example.com', 'CNAME')).toBe('autoConfig');
    expect(kind('autoconfig.example.com', 'CNAME')).toBe('autoConfigLegacy');
    expect(kind('autodiscover.example.com', 'CNAME')).toBe('autoDiscover');
    expect(kind('example.com', 'CAA')).toBe('caa');
    expect(kind('_25._tcp.mail.example.com', 'TLSA')).toBe('tlsa');
  });

  it('skips comments and records it cannot place', () => {
    expect(records.some((r) => r.name === 'www.example.com')).toBe(false);
    expect(records).toHaveLength(14);
  });

  it('reads past an optional TTL', () => {
    expect(records.find((r) => r.kind === 'dkim')?.value).toBe('"v=DKIM1; k=ed25519; p=abc"');
  });

  it('joins a long TXT record the server splits across lines, as BIND does', () => {
    const zone = [
      'example.com. IN MX 10 mail.example.com.',
      'rsa._domainkey.example.com. IN TXT (',
      '    "v=DKIM1; k=rsa; p=MIIBIjAN"',
      '    "BgkqhkiG9w0BAQEFAAOC"',
      ')',
      '_dmarc.example.com. IN TXT "v=DMARC1; p=reject"',
    ].join('\n');
    const records = parseZone(zone);
    const dkim = records.find((r) => r.kind === 'dkim');
    expect(dkim?.value).toBe('"v=DKIM1; k=rsa; p=MIIBIjAN" "BgkqhkiG9w0BAQEFAAOC"');
    expect(normalizeValue('TXT', dkim!.value)).toBe(normalizeValue('TXT', '"v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOC"'));
    expect(records.map((r) => r.kind)).toEqual(['mx', 'dkim', 'dmarc']);
  });

  it('keeps parentheses that are inside a quoted value', () => {
    const [r] = parseZone('_dmarc.example.com. IN TXT "v=DMARC1; p=none; (test)"');
    expect(r.value).toBe('"v=DMARC1; p=none; (test)"');
  });

  it('copes with nothing', () => {
    expect(parseZone(undefined)).toEqual([]);
    expect(parseZone('')).toEqual([]);
  });
});

describe('normalizeValue', () => {
  it('joins TXT strings a resolver split up', () => {
    expect(normalizeValue('TXT', '"v=DKIM1; p=ab" "cd"')).toBe('v=DKIM1; p=abcd');
    expect(normalizeValue('TXT', '"v=spf1 mx -all"')).toBe(normalizeValue('TXT', '"v=spf1 mx -all"'));
  });

  it('ignores case and trailing dots on names', () => {
    expect(normalizeValue('MX', '10 Mail.Example.com.')).toBe('10 mail.example.com');
    expect(normalizeValue('CNAME', 'mail.example.com.')).toBe(normalizeValue('CNAME', 'mail.example.com'));
  });

  it('drops the quotes in CAA values', () => {
    expect(normalizeValue('CAA', '0 issue "letsencrypt.org"')).toBe('0 issue letsencrypt.org');
  });
});

describe('hostLabel', () => {
  it('names records relative to their zone', () => {
    expect(hostLabel('example.com', 'example.com')).toBe('@');
    expect(hostLabel('_dmarc.example.com', 'example.com')).toBe('_dmarc');
    expect(hostLabel('_dmarc.mail.example.com.', 'Example.com')).toBe('_dmarc.mail');
    expect(hostLabel('other.org', 'example.com')).toBe('other.org');
  });
});

describe('pasteParts', () => {
  const rec = (type: string, value: string) => ({ name: 'example.com', type, value, kind: 'mx' as const });
  it('unquotes and joins TXT', () => {
    expect(pasteParts(rec('TXT', '"v=DKIM1; p=ab" "cd"')).value).toBe('v=DKIM1; p=abcd');
  });
  it('splits the MX priority out', () => {
    expect(pasteParts(rec('MX', '10 mail.example.com.'))).toEqual({ value: 'mail.example.com', priority: '10' });
  });
  it('drops the trailing dot elsewhere', () => {
    expect(pasteParts(rec('CNAME', 'mail.example.com.')).value).toBe('mail.example.com');
  });
});

describe('summarizeFailure', () => {
  const cf =
    '{"success":false,"errors":[{"code":6003,"message":"Invalid request headers","error_chain":[{"code":6111,"message":"Invalid format for Authorization header"}]}],"messages":[],"result":null}';
  const reason = [
    `Failed to set DNS RRSet for _smtp._tls.dev.test./TXT: Failed to set DNS RRSet: API error: BadRequest ${cf}`,
    `Failed to set DNS RRSet for dev.test./MX: Failed to set DNS RRSet: API error: BadRequest ${cf}`,
  ].join('; ');

  it('keeps each provider message once, the cause first, and counts the records', () => {
    expect(summarizeFailure(reason)).toEqual({
      messages: ['Invalid format for Authorization header', 'Invalid request headers'],
      records: 2,
    });
  });

  it('falls back to the first error when there is no provider JSON', () => {
    expect(summarizeFailure('Failed to build DNS updater: bad zone').messages).toEqual([
      'Failed to build DNS updater: bad zone',
    ]);
    expect(summarizeFailure(undefined)).toEqual({ messages: [], records: 0 });
  });
});
