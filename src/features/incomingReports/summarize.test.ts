/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { DmarcExternalReport, DmarcRecord, DmarcReport, JmapList, TlsExternalReport, TlsPolicy } from './api';
import { summarizeDmarc, summarizeTls } from './summarize';

function record(over: Partial<DmarcRecord> = {}): DmarcRecord {
  return {
    sourceIp: '192.0.2.10',
    count: 10,
    headerFrom: 'example.org',
    evaluatedDisposition: 'none',
    evaluatedDkim: 'pass',
    evaluatedSpf: 'pass',
    dkimResults: [{ domain: 'example.org', selector: 's1', result: 'pass' }],
    spfResults: [{ domain: 'example.org', result: 'pass' }],
    ...over,
  };
}

function dmarc(records: DmarcRecord[], over: Partial<DmarcReport> = {}, id = 'a'): DmarcExternalReport {
  return {
    id,
    receivedAt: '2026-10-02T00:00:00Z',
    report: {
      orgName: 'google.com',
      dateRangeBegin: '2026-10-01T00:00:00Z',
      dateRangeEnd: '2026-10-02T00:00:00Z',
      policyDomain: 'example.org',
      policyDisposition: 'none',
      records,
      ...over,
    },
  };
}

describe('summarizeDmarc', () => {
  it('reads lists the way the server sends them: maps keyed by index', () => {
    const wire = dmarc([]);
    wire.report.records = {
      '0': record({ dkimResults: { '0': { domain: 'example.org', result: 'pass' } }, spfResults: {} }),
      '1': record({
        sourceIp: '203.0.113.5',
        evaluatedDkim: 'fail',
        evaluatedSpf: 'fail',
        dkimResults: {},
        spfResults: {},
      }),
    };
    const [d] = summarizeDmarc([wire]);
    expect(d).toMatchObject({ messages: 20, passed: 10, failed: 10 });
    expect(d.sources.map((s) => s.label)).toEqual(['203.0.113.5', 'example.org']);
  });

  it('counts passing mail under the domain that proved it', () => {
    const [d] = summarizeDmarc([
      dmarc([record(), record({ sourceIp: '192.0.2.11', count: 5 })]),
      dmarc([record({ count: 3 })], { orgName: 'Yahoo' }, 'b'),
    ]);
    expect(d).toMatchObject({ domain: 'example.org', messages: 18, passed: 18, failed: 0, reports: 2 });
    expect(d.sources).toHaveLength(1);
    expect(d.sources[0]).toMatchObject({ label: 'example.org', provedBy: 'dkim', messages: 18 });
    expect(d.sources[0].ips).toEqual(['192.0.2.10', '192.0.2.11']);
    expect(d.sources[0].reporters).toEqual(['google.com', 'Yahoo']);
  });

  it('names a service by its passing SPF domain when there is no DKIM pass', () => {
    const [d] = summarizeDmarc([
      dmarc([
        record({
          evaluatedDkim: 'fail',
          dkimResults: [],
          spfResults: [{ domain: 'bounces.mailer.example', result: 'pass' }],
        }),
      ]),
    ]);
    expect(d.sources[0]).toMatchObject({ label: 'bounces.mailer.example', provedBy: 'spf', passed: 10 });
  });

  it('lists failing senders by IP, first, with what receivers did', () => {
    const fail: Partial<DmarcRecord> = { evaluatedDkim: 'fail', evaluatedSpf: 'fail', dkimResults: [], spfResults: [] };
    const [d] = summarizeDmarc([
      dmarc([
        record({ count: 100 }),
        record({ ...fail, sourceIp: '203.0.113.5', count: 4, evaluatedDisposition: 'reject' }),
        record({ ...fail, sourceIp: '203.0.113.5', count: 2, evaluatedDisposition: 'none' }),
        record({ ...fail, sourceIp: '203.0.113.9', count: 1, evaluatedDisposition: 'quarantine' }),
      ]),
    ]);
    expect(d).toMatchObject({ messages: 107, passed: 100, failed: 7 });
    expect(d.sources.map((s) => s.label)).toEqual(['203.0.113.5', '203.0.113.9', 'example.org']);
    expect(d.sources[0].failedHandling).toEqual({ delivered: 2, quarantined: 0, rejected: 4 });
    expect(d.sources[0].provedBy).toBeNull();
  });

  it('takes the policy from the newest report', () => {
    const [d] = summarizeDmarc([
      dmarc([record()], { policyDisposition: 'reject', dateRangeEnd: '2026-10-05T00:00:00Z' }, 'new'),
      dmarc([record()], { policyDisposition: 'none', dateRangeEnd: '2026-09-30T00:00:00Z' }, 'old'),
    ]);
    expect(d.policy).toBe('reject');
    expect(d.until).toBe('2026-10-05T00:00:00Z');
  });

  it('puts the domain with failures first', () => {
    const out = summarizeDmarc([
      dmarc([record({ count: 1000 })], { policyDomain: 'busy.example' }, '1'),
      dmarc(
        [record({ evaluatedDkim: 'fail', evaluatedSpf: 'fail', count: 1 })],
        { policyDomain: 'Quiet.example' },
        '2',
      ),
    ]);
    expect(out.map((d) => d.domain)).toEqual(['quiet.example', 'busy.example']);
  });
});

function tls(policies: JmapList<TlsPolicy>, org = 'google.com'): TlsExternalReport {
  return {
    id: org,
    receivedAt: '2026-10-02T00:00:00Z',
    report: {
      organizationName: org,
      dateRangeStart: '2026-10-01T00:00:00Z',
      dateRangeEnd: '2026-10-02T00:00:00Z',
      policies,
    },
  };
}

describe('summarizeTls', () => {
  it('reads policies and failures sent as maps keyed by index', () => {
    const [d] = summarizeTls([
      tls({
        '0': {
          policyDomain: 'example.org',
          totalSuccessfulSessions: 5,
          totalFailedSessions: 2,
          failureDetails: { '0': { resultType: 'certificateExpired', failedSessionCount: 2 } },
        },
      }),
    ]);
    expect(d).toMatchObject({ domain: 'example.org', succeeded: 5, failed: 2 });
    expect(d.failures).toEqual([{ kind: 'certificateExpired', sessions: 2, hosts: [] }]);
  });

  it('adds up sessions per domain and groups failures by kind', () => {
    const [d] = summarizeTls([
      tls([
        {
          policyDomain: 'example.org',
          totalSuccessfulSessions: 50,
          totalFailedSessions: 3,
          failureDetails: [
            { resultType: 'certificateExpired', failedSessionCount: 2, receivingMxHostname: 'mx.example.org.' },
            { resultType: 'somethingNew', failedSessionCount: 1 },
          ],
        },
      ]),
      tls(
        [
          {
            policyDomain: 'example.org',
            totalSuccessfulSessions: 10,
            totalFailedSessions: 1,
            failureDetails: [
              { resultType: 'certificateExpired', failedSessionCount: 1, receivingMxHostname: 'mx.example.org' },
            ],
          },
        ],
        'Microsoft',
      ),
    ]);
    expect(d).toMatchObject({ domain: 'example.org', succeeded: 60, failed: 4, reports: 2 });
    expect(d.failures).toEqual([
      { kind: 'certificateExpired', sessions: 3, hosts: ['mx.example.org'] },
      { kind: 'other', sessions: 1, hosts: [] },
    ]);
    expect(d.reporters).toEqual(['google.com', 'Microsoft']);
  });

  it('puts domains with failures first', () => {
    const out = summarizeTls([
      tls([
        { policyDomain: 'a.example', totalSuccessfulSessions: 9, totalFailedSessions: 0 },
        { policyDomain: 'b.example', totalSuccessfulSessions: 1, totalFailedSessions: 1 },
      ]),
    ]);
    expect(out.map((d) => d.domain)).toEqual(['b.example', 'a.example']);
  });
});
