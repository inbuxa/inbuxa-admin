/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { CONFIRM_PHRASE, parsePolicy, phraseMatches, protocolRows, type ProtocolPolicy } from './protocolPolicy';

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
