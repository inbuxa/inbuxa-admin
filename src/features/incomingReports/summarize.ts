/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: turns received DMARC and TLS reports into "who sends as your
 * domain, and do they pass" (admin UX roadmap, item 6). Pure, so it can be
 * tested without a server.
 */

import type { Disposition, DmarcExternalReport, DmarcRecord, TlsExternalReport } from './api';

/** One server (or service) that sent mail with one of our domains in From. */
export interface Source {
  /** What the sender proved it was: the domain whose DKIM signature or SPF passed, else its IP address. */
  label: string;
  /** How it proved it, when it did. */
  provedBy: 'dkim' | 'spf' | null;
  ips: string[];
  messages: number;
  /** Messages that passed DMARC (an aligned DKIM or SPF pass). */
  passed: number;
  /** What receivers did with the messages that failed. */
  failedHandling: Record<'delivered' | 'quarantined' | 'rejected', number>;
  reporters: string[];
}

export interface DomainSummary {
  domain: string;
  messages: number;
  passed: number;
  failed: number;
  /** The policy the newest report saw published. */
  policy: 'none' | 'quarantine' | 'reject' | 'unknown';
  testing: boolean;
  /** Failing sources first, then the busiest. */
  sources: Source[];
  from: string;
  until: string;
  reports: number;
}

const passes = (r: DmarcRecord) => r.evaluatedDkim === 'pass' || r.evaluatedSpf === 'pass';

function handling(d: Disposition): keyof Source['failedHandling'] {
  if (d === 'reject') return 'rejected';
  if (d === 'quarantine') return 'quarantined';
  return 'delivered';
}

/** Who the sender proved to be. A pass without a passing domain falls back to the IP. */
function identify(r: DmarcRecord): Pick<Source, 'label' | 'provedBy'> {
  const dkim = r.dkimResults?.find((d) => d.result === 'pass' && d.domain);
  if (dkim) return { label: dkim.domain.toLowerCase(), provedBy: 'dkim' };
  const spf = r.spfResults?.find((s) => s.result === 'pass' && s.domain);
  if (spf) return { label: spf.domain.toLowerCase(), provedBy: 'spf' };
  return { label: r.sourceIp ?? '?', provedBy: null };
}

export function summarizeDmarc(reports: DmarcExternalReport[]): DomainSummary[] {
  const domains = new Map<string, DomainSummary & { sourceMap: Map<string, Source> }>();
  /** Per domain, the end of the newest report, whose policy wins. */
  const newest = new Map<string, string>();
  for (const { report } of reports) {
    const name = report.policyDomain.toLowerCase();
    let d = domains.get(name);
    if (!d) {
      d = {
        domain: name,
        messages: 0,
        passed: 0,
        failed: 0,
        policy: 'unknown',
        testing: false,
        sources: [],
        from: report.dateRangeBegin,
        until: report.dateRangeEnd,
        reports: 0,
        sourceMap: new Map(),
      };
      domains.set(name, d);
    }
    d.reports += 1;
    if (report.dateRangeBegin < d.from) d.from = report.dateRangeBegin;
    if (report.dateRangeEnd > d.until) d.until = report.dateRangeEnd;
    if (report.dateRangeEnd >= (newest.get(name) ?? '')) {
      newest.set(name, report.dateRangeEnd);
      const p = report.policyDisposition;
      d.policy = p === 'none' || p === 'quarantine' || p === 'reject' ? p : 'unknown';
      d.testing = report.policyTestingMode === true;
    }
    for (const r of report.records ?? []) {
      const count = r.count ?? 0;
      const ok = passes(r);
      const who = identify(r);
      // A failing sender proved nothing, so each IP is its own source.
      const key = ok ? `${who.provedBy}:${who.label}` : `ip:${r.sourceIp ?? '?'}`;
      let s = d.sourceMap.get(key);
      if (!s) {
        s = {
          ...(ok ? who : { label: r.sourceIp ?? '?', provedBy: null }),
          ips: [],
          messages: 0,
          passed: 0,
          failedHandling: { delivered: 0, quarantined: 0, rejected: 0 },
          reporters: [],
        };
        d.sourceMap.set(key, s);
      }
      s.messages += count;
      d.messages += count;
      if (ok) {
        s.passed += count;
        d.passed += count;
      } else {
        s.failedHandling[handling(r.evaluatedDisposition)] += count;
        d.failed += count;
      }
      if (r.sourceIp && !s.ips.includes(r.sourceIp)) s.ips.push(r.sourceIp);
      if (report.orgName && !s.reporters.includes(report.orgName)) s.reporters.push(report.orgName);
    }
  }
  return [...domains.values()]
    .map(({ sourceMap, ...d }) => ({
      ...d,
      sources: [...sourceMap.values()].sort(
        (a, b) => b.messages - b.passed - (a.messages - a.passed) || b.messages - a.messages,
      ),
    }))
    .sort((a, b) => b.failed - a.failed || b.messages - a.messages || a.domain.localeCompare(b.domain));
}

export type TlsFailureKind =
  | 'startTlsNotSupported'
  | 'certificateHostMismatch'
  | 'certificateExpired'
  | 'certificateNotTrusted'
  | 'validationFailure'
  | 'tlsaInvalid'
  | 'dnssecInvalid'
  | 'daneRequired'
  | 'stsPolicyFetchError'
  | 'stsPolicyInvalid'
  | 'stsWebpkiInvalid'
  | 'other';

export interface TlsSummary {
  domain: string;
  succeeded: number;
  failed: number;
  /** Failure kinds, most sessions first. */
  failures: { kind: TlsFailureKind; sessions: number; hosts: string[] }[];
  reporters: string[];
  reports: number;
}

const KINDS = new Set<string>([
  'startTlsNotSupported',
  'certificateHostMismatch',
  'certificateExpired',
  'certificateNotTrusted',
  'validationFailure',
  'tlsaInvalid',
  'dnssecInvalid',
  'daneRequired',
  'stsPolicyFetchError',
  'stsPolicyInvalid',
  'stsWebpkiInvalid',
]);

export function summarizeTls(reports: TlsExternalReport[]): TlsSummary[] {
  const domains = new Map<string, TlsSummary & { kinds: Map<TlsFailureKind, { sessions: number; hosts: string[] }> }>();
  for (const { report } of reports) {
    const counted = new Set<string>();
    for (const p of report.policies ?? []) {
      const name = p.policyDomain.toLowerCase();
      let d = domains.get(name);
      if (!d) {
        d = { domain: name, succeeded: 0, failed: 0, failures: [], reporters: [], reports: 0, kinds: new Map() };
        domains.set(name, d);
      }
      if (!counted.has(name)) {
        d.reports += 1;
        counted.add(name);
      }
      d.succeeded += p.totalSuccessfulSessions ?? 0;
      d.failed += p.totalFailedSessions ?? 0;
      const org = report.organizationName;
      if (org && !d.reporters.includes(org)) d.reporters.push(org);
      for (const f of p.failureDetails ?? []) {
        const kind = (f.resultType && KINDS.has(f.resultType) ? f.resultType : 'other') as TlsFailureKind;
        const k = d.kinds.get(kind) ?? { sessions: 0, hosts: [] };
        k.sessions += f.failedSessionCount ?? 0;
        const host = f.receivingMxHostname?.replace(/\.$/, '');
        if (host && !k.hosts.includes(host)) k.hosts.push(host);
        d.kinds.set(kind, k);
      }
    }
  }
  return [...domains.values()]
    .map(({ kinds, ...d }) => ({
      ...d,
      failures: [...kinds.entries()].map(([kind, k]) => ({ kind, ...k })).sort((a, b) => b.sessions - a.sessions),
    }))
    .sort((a, b) => b.failed - a.failed || a.domain.localeCompare(b.domain));
}
