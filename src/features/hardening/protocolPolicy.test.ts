/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  ago,
  CONFIRM_PHRASE,
  impactEntries,
  parsePolicy,
  parseTenantPolicy,
  phraseMatches,
  protocolRows,
  type ProtocolPolicy,
} from './protocolPolicy';

// As inbuxa:ProtocolPolicy/get sends it: listeners keyed by the policy's own property names.
const WIRE = {
  id: 'singleton',
  legacyProtocols: 'enabled',
  closeSubmission: false,
  savedListeners: [],
  changedAt: null,
  changedBy: null,
  lockedProtocols: ['smtp', 'lmtp', 'http'],
  wouldClose: [
    { id: 'imaptls', legacyProtocols: 'imap', wouldClose: [993] },
    { id: 'imap', legacyProtocols: 'imap', wouldClose: [143] },
    { id: 'sieve', legacyProtocols: 'manageSieve', wouldClose: [4190] },
  ],
};

function policy(overrides: Partial<ProtocolPolicy> = {}): ProtocolPolicy {
  return { ...parsePolicy(WIRE), ...overrides };
}

describe('parsePolicy', () => {
  it('reads listeners back into names, protocols and ports', () => {
    const p = parsePolicy(WIRE);
    expect(p.wouldClose[0]).toEqual({ name: 'imaptls', protocol: 'imap', ports: [993] });
    expect(p.lockedProtocols).toEqual(['smtp', 'lmtp', 'http']);
    expect(p.legacyProtocols).toBe('enabled');
  });

  it('treats anything but "disabled" as enabled, and drops malformed listeners', () => {
    const p = parsePolicy({ legacyProtocols: 'maybe', wouldClose: [null, { legacyProtocols: 'imap' }] });
    expect(p.legacyProtocols).toBe('enabled');
    expect(p.wouldClose).toEqual([]);
    expect(p.changedAt).toBeNull();
  });
});

describe('protocolRows (LP-21)', () => {
  it('lists every mail protocol, with SMTP and JMAP locked', () => {
    const rows = protocolRows(policy(), policy().wouldClose);
    expect(rows.map((r) => r.key)).toEqual(['imap', 'pop3', 'manageSieve', 'submission', 'smtp', 'jmap']);
    expect(rows.find((r) => r.key === 'smtp')?.state).toBe('locked');
    expect(rows.find((r) => r.key === 'jmap')?.state).toBe('locked');
  });

  it('gathers each protocol’s ports, sorted and without repeats', () => {
    const rows = protocolRows(policy(), policy().wouldClose);
    expect(rows.find((r) => r.key === 'imap')?.ports).toEqual([143, 993]);
    expect(rows.find((r) => r.key === 'pop3')?.ports).toEqual([]);
    expect(rows.find((r) => r.key === 'manageSieve')?.ports).toEqual([4190]);
  });

  it('keeps submission locked while the server locks SMTP, whatever closeSubmission says', () => {
    const rows = protocolRows(policy({ closeSubmission: true }), []);
    expect(rows.find((r) => r.key === 'submission')?.state).toBe('locked');
  });

  it('follows closeSubmission once the server unlocks SMTP, with no admin change', () => {
    const unlocked = policy({ lockedProtocols: ['lmtp', 'http'] });
    const listeners = [{ name: 'submissions', protocol: 'smtp', ports: [465] }];
    const closing = protocolRows({ ...unlocked, closeSubmission: true }, listeners);
    expect(closing.find((r) => r.key === 'submission')).toMatchObject({ state: 'closes', ports: [465] });
    const keeping = protocolRows({ ...unlocked, closeSubmission: false }, listeners);
    expect(keeping.find((r) => r.key === 'submission')?.state).toBe('refused');
  });
});

describe('phraseMatches (LP-17)', () => {
  it('accepts only the exact phrase', () => {
    expect(phraseMatches(CONFIRM_PHRASE)).toBe(true);
    expect(phraseMatches('Turn off legacy mail')).toBe(false);
    expect(phraseMatches(' turn off legacy mail')).toBe(false);
    expect(phraseMatches('turn off legacy')).toBe(false);
    expect(phraseMatches('')).toBe(false);
  });
});

describe('the impact panel (LP-15)', () => {
  it('reads nothing from a server too old to say, and an empty list as nobody', () => {
    expect(parsePolicy(WIRE).recentLegacyUse).toBeNull();
    expect(parsePolicy({ ...WIRE, recentLegacyUse: [] }).recentLegacyUse).toEqual([]);
  });

  it('shows each account once, with every protocol it used and its latest use', () => {
    const recent = parsePolicy({
      ...WIRE,
      recentLegacyUse: [
        { accountId: 'a', name: 'maria@example.org', protocol: 'submission', lastUsedAt: 100 },
        { accountId: 'a', name: 'maria@example.org', protocol: 'imap', lastUsedAt: 300 },
        { accountId: 'b', name: 'ada@example.org', protocol: 'pop3', lastUsedAt: 200 },
        { accountId: 'c', name: 'bad' },
      ],
    }).recentLegacyUse!;
    expect(impactEntries(recent)).toEqual([
      { name: 'maria@example.org', protocols: ['IMAP', 'SMTP submission'], lastUsedAt: 300 },
      { name: 'ada@example.org', protocols: ['POP3'], lastUsedAt: 200 },
    ]);
  });

  it('says how long ago in words', () => {
    const now = Date.UTC(2026, 8, 21);
    expect(ago(now - 2 * 86400_000, now, 'en')).toBe('2 days ago');
    expect(ago(now - 3 * 3600_000, now, 'en')).toBe('3 hours ago');
    expect(ago(now - 10_000, now, 'en')).toBe('this minute');
  });
});

describe("a tenant's switch", () => {
  it('reads the wire, and tells an older server from nobody', () => {
    const p = parseTenantPolicy({
      id: 'b',
      tenantId: 'b',
      legacyProtocols: 'disabled',
      changedAt: 5,
      recentLegacyUse: [{ accountId: 'c', name: 'u@t.example', protocol: 'imap', lastUsedAt: 9 }],
    });
    expect(p).toMatchObject({ id: 'b', legacyProtocols: 'disabled', changedAt: 5 });
    expect(p.recentLegacyUse).toHaveLength(1);
    expect(parseTenantPolicy({ id: 'b' })).toMatchObject({ legacyProtocols: 'enabled', recentLegacyUse: null });
  });
});
