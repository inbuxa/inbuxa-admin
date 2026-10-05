/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: grading the deliverability reports (deliverability spec, DL-4 to
 * DL-13). The server keeps facts; this turns them into findings, each Fail,
 * Warn or Couldn't check, with one sentence on what's wrong, one on why it
 * matters, and one fix. What passed is kept too, for the "Passed checks"
 * fold. Pure, so the wording can change without a server release.
 */

import type { Address, DomainReport, Listing, ListInfo, Report } from './api';

export type Grade = 'fail' | 'warn' | 'unknown';

export type Fix =
  /** The list's own site: to ask for removal, or, when it wouldn't answer, to see why. */
  | { kind: 'list'; url: string; removal: boolean }
  | { kind: 'domain'; domain: string }
  | { kind: 'view'; viewName: string }
  /** Something only the hosting provider or the DNS host can change. */
  | { kind: 'elsewhere' };

export interface Finding {
  /** Stable across runs: rule, node and subject. */
  key: string;
  rule: string;
  grade: Grade;
  /** 'node' findings belong to a node's addresses; 'domain' ones to a domain. */
  scope: 'node' | 'domain';
  /** The node's hostname, or the domain. */
  owner: string;
  title: string;
  why: string;
  fix: Fix;
}

export interface Passed {
  key: string;
  scope: 'node' | 'domain';
  owner: string;
  title: string;
  /** Set when the check wasn't asked, with why. */
  notChecked?: string;
}

export interface Graded {
  findings: Finding[];
  passed: Passed[];
}

type T = (key: string, fallback: string, options?: Record<string, unknown>) => string;

const ORDER: Record<Grade, number> = { fail: 0, warn: 1, unknown: 2 };

function listFix(lists: ListInfo[], name: string, removal: boolean): Fix {
  const info = lists.find((l) => l.name === name);
  return info ? { kind: 'list', url: info.lookup, removal } : { kind: 'elsewhere' };
}

function gradeListings(
  t: T,
  lists: ListInfo[],
  scope: 'node' | 'domain',
  owner: string,
  subject: string,
  rule: string,
  listings: Listing[],
  out: Graded,
) {
  for (const l of listings) {
    const key = `${rule}|${owner}|${subject}|${l.list}`;
    if (l.state === 'listed') {
      out.findings.push({
        key,
        rule,
        grade: 'fail',
        scope,
        owner,
        title: t('deliv.listed', '{{subject}} is on {{list}}', { subject, list: l.list }),
        why: l.meaning
          ? t('deliv.listedWhy', '{{meaning}}. Servers that use this list refuse or file away its mail.', {
              meaning: l.meaning,
            })
          : t('deliv.listedWhyPlain', 'Servers that use this list refuse or file away its mail.'),
        fix: listFix(lists, l.list, true),
      });
    } else if (l.state === 'refused' || l.state === 'error') {
      // A list that only answers registered resolvers says so (Barracuda)
      const note = lists.find((x) => x.name === l.list)?.note;
      out.findings.push({
        key,
        rule,
        grade: 'unknown',
        scope,
        owner,
        title: t('deliv.unchecked', "Couldn't check {{subject}} on {{list}}", { subject, list: l.list }),
        why: note ?? l.meaning ?? t('deliv.uncheckedWhy', 'The list gave no usable answer.'),
        fix: listFix(lists, l.list, false),
      });
    } else if (l.state === 'off') {
      out.passed.push({
        key,
        scope,
        owner,
        title: t('deliv.onList', '{{subject}} on {{list}}', { subject, list: l.list }),
        notChecked: t('deliv.listOff', 'switched off'),
      });
    } else {
      out.passed.push({
        key,
        scope,
        owner,
        title: t('deliv.notListed', '{{subject}} isn’t on {{list}}', { subject, list: l.list }),
      });
    }
  }
}

function gradeAddress(t: T, lists: ListInfo[], owner: string, a: Address, out: Graded) {
  gradeListings(t, lists, 'node', owner, a.ip, 'DL-4', a.listings, out);
  const key = `DL-5|${owner}|${a.ip}`;
  const base = { key, rule: 'DL-5', scope: 'node' as const, owner, fix: { kind: 'elsewhere' as const } };
  if (a.ptrError) {
    out.findings.push({
      ...base,
      grade: 'unknown',
      title: t('deliv.ptrUnknown', "Couldn't look up {{ip}}'s reverse DNS", { ip: a.ip }),
      why: a.ptrError,
    });
  } else if (a.ptr.length === 0) {
    out.findings.push({
      ...base,
      grade: 'fail',
      title: t('deliv.noPtr', '{{ip}} has no reverse DNS', { ip: a.ip }),
      why: t(
        'deliv.noPtrWhy',
        'Most large mail services refuse mail from an address with no name. Your hosting provider sets it; ask for {{ehlo}}.',
        { ehlo: a.ehlo },
      ),
    });
  } else if (!a.forwardConfirmed) {
    out.findings.push({
      ...base,
      grade: 'fail',
      title: t('deliv.ptrNotBack', '{{ip}}’s reverse DNS doesn’t lead back to it', { ip: a.ip }),
      why: t(
        'deliv.ptrNotBackWhy',
        '{{ptr}} doesn’t resolve to {{ip}}, so receivers treat the name as made up. Point {{ptr}} at {{ip}}, or change the reverse DNS.',
        { ptr: a.ptr[0], ip: a.ip },
      ),
    });
  } else if (!a.ehloMatches) {
    out.findings.push({
      ...base,
      grade: 'warn',
      title: t('deliv.ptrNotEhlo', '{{ip}}’s reverse DNS isn’t the name it greets with', { ip: a.ip }),
      why: t(
        'deliv.ptrNotEhloWhy',
        'It says {{ptr}}; the server greets as {{ehlo}}. Some receivers score that as suspicious.',
        { ptr: a.ptr[0], ehlo: a.ehlo },
      ),
    });
  } else {
    out.passed.push({
      key,
      scope: 'node',
      owner,
      title: t('deliv.ptrOk', '{{ip}} resolves to {{ptr}} and back', { ip: a.ip, ptr: a.ptr[0] }),
    });
  }
}

function gradeDomain(t: T, lists: ListInfo[], node: string, d: DomainReport, out: Graded) {
  const owner = d.domain;
  const toDomain: Fix = { kind: 'domain', domain: d.domain };

  // DL-7
  for (const s of d.spf) {
    const key = `DL-7|${owner}|${s.ip}`;
    if (s.result === 'pass') {
      out.passed.push({
        key,
        scope: 'domain',
        owner,
        title: t('deliv.spfOk', 'SPF lets {{ip}} ({{node}}) send', { ip: s.ip, node }),
      });
    } else if (s.result === 'tempError') {
      out.findings.push({
        key,
        rule: 'DL-7',
        grade: 'unknown',
        scope: 'domain',
        owner,
        title: t('deliv.spfUnknown', "Couldn't check SPF for {{ip}}", { ip: s.ip }),
        why: t('deliv.spfUnknownWhy', 'The SPF lookup failed for now; it’s tried again at the next check.'),
        fix: toDomain,
      });
    } else {
      out.findings.push({
        key,
        rule: 'DL-7',
        grade: 'fail',
        scope: 'domain',
        owner,
        title:
          s.result === 'none'
            ? t('deliv.spfNone', '{{domain}} has no SPF record', { domain: owner })
            : t('deliv.spfFail', 'SPF doesn’t let {{ip}} ({{node}}) send for {{domain}}', {
                ip: s.ip,
                node,
                domain: owner,
              }),
        why: t(
          'deliv.spfWhy',
          'Receivers check SPF on every message; mail from an address it doesn’t name is often refused. Add the address, or publish the record the domain page suggests.',
        ),
        fix: toDomain,
      });
    }
  }

  // DL-8
  for (const k of d.dkim) {
    const key = `DL-8|${owner}|${k.selector}`;
    if (k.state === 'matches') {
      out.passed.push({
        key,
        scope: 'domain',
        owner,
        title: t('deliv.dkimOk', 'DKIM key {{selector}} is published as signed', { selector: k.selector }),
      });
      continue;
    }
    out.findings.push({
      key,
      rule: 'DL-8',
      grade: k.state === 'error' ? 'unknown' : 'fail',
      scope: 'domain',
      owner,
      title:
        k.state === 'missing'
          ? t('deliv.dkimMissing', 'DKIM key {{selector}} isn’t in DNS', { selector: k.selector })
          : k.state === 'different'
            ? t('deliv.dkimDifferent', 'DNS has a different key for DKIM selector {{selector}}', {
                selector: k.selector,
              })
            : t('deliv.dkimUnknown', "Couldn't check DKIM key {{selector}}", { selector: k.selector }),
      why: t(
        'deliv.dkimWhy',
        'Every message is signed with this key; while DNS doesn’t have it, the signature fails at the receiver. Publish the record from the domain page.',
      ),
      fix: toDomain,
    });
  }

  // DL-9: aligned through DKIM (the domain signs as itself) or SPF
  if (d.dmarc) {
    const key = `DL-9|${owner}`;
    const dkimAligned = d.dkim.some((k) => k.state === 'matches');
    const spfAligned = d.spf.length > 0 && d.spf.every((s) => s.result === 'pass');
    if (dkimAligned || spfAligned) {
      out.passed.push({ key, scope: 'domain', owner, title: t('deliv.dmarcOk', 'DMARC aligns') });
    } else {
      out.findings.push({
        key,
        rule: 'DL-9',
        grade: 'fail',
        scope: 'domain',
        owner,
        title: t('deliv.dmarcFail', 'Mail from {{domain}} doesn’t pass DMARC', { domain: owner }),
        why: t(
          'deliv.dmarcWhy',
          'Neither a DKIM key in DNS nor SPF vouches for every address, so receivers apply the domain’s DMARC policy ({{policy}}).',
          { policy: d.dmarc.policy },
        ),
        fix: toDomain,
      });
    }
  }

  // DL-10, DL-11
  const sts = d.mtaSts;
  if (sts.recordId) {
    const key = `DL-10|${owner}`;
    if (!sts.fetched) {
      out.findings.push({
        key,
        rule: 'DL-10',
        grade: 'fail',
        scope: 'domain',
        owner,
        title: t('deliv.stsFetch', '{{domain}}’s MTA-STS policy can’t be fetched', { domain: owner }),
        why: t(
          'deliv.stsFetchWhy',
          'The DNS record says there is one, so senders that enforce MTA-STS may hold mail for {{domain}}. {{error}}',
          { domain: owner, error: sts.error ?? '' },
        ),
        fix: toDomain,
      });
    } else if (sts.mxNotCovered.length > 0) {
      out.findings.push({
        key,
        rule: 'DL-10',
        grade: 'fail',
        scope: 'domain',
        owner,
        title: t('deliv.stsMx', '{{domain}}’s MTA-STS policy leaves out {{mx}}', {
          domain: owner,
          mx: sts.mxNotCovered.join(', '),
        }),
        why: t(
          'deliv.stsMxWhy',
          'Senders that enforce the policy won’t deliver to an MX it doesn’t name. Add it to the policy’s MX hosts.',
        ),
        fix: { kind: 'view', viewName: 'x:MtaSts' },
      });
    } else if (sts.mode === 'testing') {
      out.findings.push({
        key,
        rule: 'DL-10',
        grade: 'warn',
        scope: 'domain',
        owner,
        title: t('deliv.stsTesting', '{{domain}}’s MTA-STS policy is in testing mode', { domain: owner }),
        why: t(
          'deliv.stsTestingWhy',
          'Senders report problems but still deliver without TLS if it fails. Switch to enforce once the reports are clean.',
        ),
        fix: { kind: 'view', viewName: 'x:MtaSts' },
      });
    } else {
      out.passed.push({ key, scope: 'domain', owner, title: t('deliv.stsOk', 'MTA-STS policy covers every MX') });
    }
    const rptKey = `DL-11|${owner}`;
    if (!d.tlsRpt) {
      out.findings.push({
        key: rptKey,
        rule: 'DL-11',
        grade: 'warn',
        scope: 'domain',
        owner,
        title: t('deliv.noTlsRpt', '{{domain}} has no TLS reporting record', { domain: owner }),
        why: t(
          'deliv.noTlsRptWhy',
          'With MTA-STS in place, failed TLS deliveries go unreported. Publish the TLS-RPT record from the domain page.',
        ),
        fix: toDomain,
      });
    } else {
      out.passed.push({ key: rptKey, scope: 'domain', owner, title: t('deliv.tlsRptOk', 'TLS reporting is on') });
    }
  }

  // DL-12
  gradeListings(t, lists, 'domain', owner, owner, 'DL-12', d.listings, out);
}

/** Every finding and pass across the nodes' reports, worst first. */
export function grade(reports: Report[], lists: ListInfo[], t: T): Graded {
  const out: Graded = { findings: [], passed: [] };
  for (const r of reports) {
    for (const a of r.addresses) gradeAddress(t, lists, r.hostname, a, out);
    // DL-13
    for (const c of r.certificates) {
      const key = `DL-13|${r.hostname}|${c.name}`;
      if (c.covered) {
        out.passed.push({
          key,
          scope: 'node',
          owner: r.hostname,
          title: t('deliv.certOk', 'Certificate for {{name}}', { name: c.name }),
        });
      } else {
        out.findings.push({
          key,
          rule: 'DL-13',
          grade: 'fail',
          scope: 'node',
          owner: r.hostname,
          title: t('deliv.noCert', 'No certificate for {{name}}', { name: c.name }),
          why: t(
            'deliv.noCertWhy',
            'Senders connecting to {{name}} get the wrong certificate, and those that check it won’t deliver.',
            { name: c.name },
          ),
          fix: { kind: 'view', viewName: 'x:Certificate' },
        });
      }
    }
    for (const d of r.domains) gradeDomain(t, lists, r.hostname, d, out);
  }
  // A domain finding that every node shares (no address in it) once
  const seen = new Set<string>();
  out.findings = out.findings.filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)));
  const passedSeen = new Set<string>();
  out.passed = out.passed.filter((p) => (passedSeen.has(p.key) ? false : (passedSeen.add(p.key), true)));
  out.findings.sort((a, b) => ORDER[a.grade] - ORDER[b.grade]);
  return out;
}

/** DL-18: what goes to the dashboard's Needs attention: blocklist and reverse-DNS failures. */
export function alarms(graded: Graded): Finding[] {
  return graded.findings.filter((f) => f.grade === 'fail' && (f.rule === 'DL-4' || f.rule === 'DL-5'));
}

/** DL-19: the worst finding for a domain, for its hover card. */
export function worstFor(graded: Graded, domain: string): Finding | null {
  return graded.findings.find((f) => f.scope === 'domain' && f.owner === domain && f.grade === 'fail') ?? null;
}
