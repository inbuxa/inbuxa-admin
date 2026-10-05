/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Address, DomainReport, ListInfo, Report } from './api';
import { alarms, grade, worstFor } from './grade';

const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(options?.[k] ?? ''));

const LISTS: ListInfo[] = [
  { name: 'Spamhaus ZEN', zone: 'zen.spamhaus.org', scope: 'ip', lookup: 'https://check.spamhaus.org/' },
  { name: 'Spamhaus DBL', zone: 'dbl.spamhaus.org', scope: 'domain', lookup: 'https://check.spamhaus.org/' },
];

function address(over: Partial<Address> = {}): Address {
  return {
    ip: '192.0.2.10',
    source: 'ehlo',
    strategy: 'default',
    ehlo: 'mx.example.org',
    ptr: ['mx.example.org'],
    forwardConfirmed: true,
    ehloMatches: true,
    listings: [{ list: 'Spamhaus ZEN', state: 'clean' }],
    ...over,
  };
}

function domain(over: Partial<DomainReport> = {}): DomainReport {
  return {
    domain: 'example.org',
    spf: [{ ip: '192.0.2.10', result: 'pass' }],
    dkim: [{ selector: 'rsa', state: 'matches' }],
    dmarc: { policy: 'reject', adkim: 'relaxed', aspf: 'relaxed' },
    mtaSts: { recordId: null, fetched: false, mxNotCovered: [] },
    tlsRpt: false,
    listings: [{ list: 'Spamhaus DBL', state: 'clean' }],
    ...over,
  };
}

function report(addresses: Address[], domains: DomainReport[], over: Partial<Report> = {}): Report {
  return {
    id: 'a',
    nodeId: 1,
    hostname: 'mx.example.org',
    checkedAt: '2026-10-05T00:10:00Z',
    addresses,
    domains,
    certificates: [{ name: 'mx.example.org', covered: true }],
    ...over,
  };
}

const rules = (r: Report[]) => grade(r, LISTS, t).findings.map((f) => `${f.rule}:${f.grade}`);

describe('grade', () => {
  it('finds nothing wrong with a server in order', () => {
    const graded = grade([report([address()], [domain()])], LISTS, t);
    expect(graded.findings).toEqual([]);
    expect(graded.passed.length).toBeGreaterThan(4);
  });

  it('fails a listing, and never reads a refusal as one', () => {
    const graded = grade(
      [
        report(
          [
            address({
              listings: [
                { list: 'Spamhaus ZEN', state: 'listed', code: '127.0.0.2', meaning: 'SBL: a known spam source' },
                { list: 'SpamCop', state: 'refused', meaning: 'Too many queries' },
                { list: 'Barracuda', state: 'off' },
              ],
            }),
          ],
          [],
        ),
      ],
      LISTS,
      t,
    );
    expect(graded.findings.map((f) => [f.grade, f.title])).toEqual([
      ['fail', '192.0.2.10 is on Spamhaus ZEN'],
      ['unknown', "Couldn't check 192.0.2.10 on SpamCop"],
    ]);
    expect(graded.findings[0].fix).toEqual({ kind: 'list', url: 'https://check.spamhaus.org/', removal: true });
    expect(graded.passed.find((p) => p.title.includes('Barracuda'))?.notChecked).toBe('switched off');
  });

  it('grades reverse DNS: missing, not back, another name', () => {
    expect(rules([report([address({ ptr: [] })], [])])).toEqual(['DL-5:fail']);
    expect(rules([report([address({ forwardConfirmed: false, ehloMatches: false })], [])])).toEqual(['DL-5:fail']);
    expect(rules([report([address({ ehloMatches: false })], [])])).toEqual(['DL-5:warn']);
  });

  it('fails SPF for the node it doesn’t cover, naming it', () => {
    const graded = grade(
      [
        report([address()], [domain()]),
        report(
          [address({ ip: '198.51.100.7', ehlo: 'mx2.example.org', ptr: ['mx2.example.org'] })],
          [domain({ spf: [{ ip: '198.51.100.7', result: 'fail' }] })],
          { id: 'b', nodeId: 2, hostname: 'mx2.example.org' },
        ),
      ],
      LISTS,
      t,
    );
    const spf = graded.findings.filter((f) => f.rule === 'DL-7');
    expect(spf).toHaveLength(1);
    expect(spf[0].title).toContain('198.51.100.7 (mx2.example.org)');
  });

  it('grades DKIM keys missing or different', () => {
    expect(rules([report([], [domain({ dkim: [{ selector: 'rsa', state: 'different' }] })])])).toContain('DL-8:fail');
    expect(rules([report([], [domain({ dkim: [{ selector: 'rsa', state: 'missing' }] })])])).toContain('DL-8:fail');
  });

  it('fails DMARC only when neither DKIM nor SPF vouches', () => {
    const neither = domain({
      dkim: [{ selector: 'rsa', state: 'missing' }],
      spf: [{ ip: '192.0.2.10', result: 'fail' }],
    });
    expect(rules([report([], [neither])])).toContain('DL-9:fail');
    const dkimOnly = domain({ spf: [{ ip: '192.0.2.10', result: 'fail' }] });
    expect(rules([report([], [dkimOnly])])).not.toContain('DL-9:fail');
    // No DMARC record: the Security page's business, not this one's
    expect(rules([report([], [domain({ dmarc: null, dkim: [], spf: [] })])])).toEqual([]);
  });

  it('grades MTA-STS and wants TLS reporting with it', () => {
    const uncovered = domain({
      mtaSts: { recordId: 'x', fetched: true, mode: 'enforce', mxNotCovered: ['mx2.example.org'] },
      tlsRpt: true,
    });
    expect(rules([report([], [uncovered])])).toEqual(['DL-10:fail']);
    const testing = domain({ mtaSts: { recordId: 'x', fetched: true, mode: 'testing', mxNotCovered: [] } });
    expect(rules([report([], [testing])])).toEqual(['DL-10:warn', 'DL-11:warn']);
    const unfetched = domain({ mtaSts: { recordId: 'x', fetched: false, error: 'timed out', mxNotCovered: [] } });
    expect(rules([report([], [unfetched])])).toContain('DL-10:fail');
  });

  it('fails a name with no certificate', () => {
    expect(rules([report([], [], { certificates: [{ name: 'mx.example.org', covered: false }] })])).toEqual([
      'DL-13:fail',
    ]);
  });

  it('puts failures first, then warnings, then what couldn’t be checked', () => {
    const graded = grade(
      [
        report(
          [address({ ehloMatches: false, listings: [{ list: 'SpamCop', state: 'error' }] })],
          [domain({ dkim: [{ selector: 'rsa', state: 'missing' }] })],
        ),
      ],
      LISTS,
      t,
    );
    expect(graded.findings.map((f) => f.grade)).toEqual(['fail', 'warn', 'unknown']);
  });
});

describe('alarms and worstFor', () => {
  const graded = grade(
    [
      report(
        [address({ ptr: [], listings: [{ list: 'Spamhaus ZEN', state: 'listed' }] })],
        [domain({ domain: 'bad.example.org', dkim: [{ selector: 'rsa', state: 'missing' }] })],
      ),
    ],
    LISTS,
    t,
  );

  it('sends only blocklist and reverse-DNS failures to Needs attention', () => {
    expect(alarms(graded).map((f) => f.rule)).toEqual(['DL-4', 'DL-5']);
  });

  it('gives a domain’s worst failure for its hover card', () => {
    expect(worstFor(graded, 'bad.example.org')?.rule).toBe('DL-8');
    expect(worstFor(graded, 'example.org')).toBeNull();
  });
});
