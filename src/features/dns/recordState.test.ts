/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { LiveResult } from './liveCheck';
import { isDone, recordStates } from './recordState';
import type { ZoneRecord } from './zone';

const rec = (kind: ZoneRecord['kind'], name: string, type: string, value: string) =>
  ({ kind, name, type, value }) as ZoneRecord;

const dmarc = rec('dmarc', '_dmarc.example.com.', 'TXT', 'v=DMARC1; p=reject; rua=mailto:postmaster@example.com');
const spf = rec('spf', 'example.com.', 'TXT', 'v=spf1 mx -all');
const mx = rec('mx', 'example.com.', 'MX', '10 mail.example.com.');

const states = (pairs: [ZoneRecord, LiveResult][]) =>
  recordStates(
    pairs.map(([r]) => r),
    new Map(pairs),
  );

describe('recordStates (#239)', () => {
  it('a DMARC of the domain’s own, with its own report addresses, is valid and counts as done', () => {
    const s = states([[dmarc, { state: 'different', found: ['v=DMARC1; p=quarantine; rua=mailto:dmarc@example.org'] }]]);
    expect(s.get(dmarc)).toBe('valid');
    expect(isDone(s.get(dmarc))).toBe(true);
  });

  it('an SPF with an extra include, next to a site verification, is valid', () => {
    const s = states([
      [spf, { state: 'different', found: ['google-site-verification=abc', 'v=spf1 mx include:_spf.example.net -all'] }],
    ]);
    expect(s.get(spf)).toBe('valid');
  });

  it('two SPF records, or a DMARC with no policy, still differ', () => {
    const s = states([
      [spf, { state: 'different', found: ['v=spf1 mx -all', 'v=spf1 a ~all'] }],
      [dmarc, { state: 'different', found: ['v=DMARC1; rua=mailto:dmarc@example.org'] }],
    ]);
    expect(s.get(spf)).toBe('different');
    expect(s.get(dmarc)).toBe('different');
    expect(isDone(s.get(spf))).toBe(false);
  });

  it('a name with only other TXT records still differs, as a live check says', () => {
    const s = states([[spf, { state: 'different', found: ['google-site-verification=abc'] }]]);
    expect(s.get(spf)).toBe('different');
  });

  it('an MX elsewhere differs; live, missing and error pass through', () => {
    const s = states([
      [mx, { state: 'different', found: ['10 mx.elsewhere.example.'] }],
      [dmarc, { state: 'live', found: [] }],
      [spf, { state: 'missing', found: [] }],
    ]);
    expect(s.get(mx)).toBe('different');
    expect(s.get(dmarc)).toBe('live');
    expect(s.get(spf)).toBe('missing');
    expect(recordStates([mx], new Map()).get(mx)).toBe('error');
  });
});
