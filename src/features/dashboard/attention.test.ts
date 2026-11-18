/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildAttention } from './attention';

const t = ((key: string, opts?: unknown) => {
  const o = (typeof opts === 'object' && opts ? opts : {}) as Record<string, unknown>;
  const text = (o.count === 1 ? o.defaultValue_one : o.defaultValue_other) ?? (typeof opts === 'string' ? opts : key);
  return String(text);
}) as unknown as TFunction;

const quiet = {
  t,
  may: () => true,
  facts: null,
  health: null,
  critical: null,
  samples: [],
  liveStatus: '',
  nodesHref: null,
  slowHref: null,
  linkOf: () => null,
};

describe('buildAttention: scheduled reports (RP-17)', () => {
  it('lists reports that keep failing, linking to their page', () => {
    const items = buildAttention({
      ...quiet,
      failingReports: 2,
      failingReportsHref: '/Management/CustomComponent/ScheduledReports',
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: 'scheduledReports',
      severity: 'warn',
      count: 2,
      title: 'scheduled reports keep failing',
      href: '/Management/CustomComponent/ScheduledReports',
    });
  });

  it('says nothing when none do', () => {
    expect(buildAttention({ ...quiet, failingReports: 0 })).toEqual([]);
    expect(buildAttention({ ...quiet, failingReports: null })).toEqual([]);
  });
});

describe('buildAttention: report warnings (#218)', () => {
  const counter = (metric: string, count: number) => ({ '@type': 'Counter' as const, metric, count });
  const linkOf = (metrics: string[]) =>
    metrics[0].includes('dmarc') ? '/Management/x:DmarcExternalReport' : '/Management/x:TlsExternalReport';

  it('lists DMARC and TLS warnings as separate items, each linking to its own page', () => {
    const items = buildAttention({
      ...quiet,
      linkOf,
      samples: [
        counter('incoming-report.dmarc-report-with-warnings', 3),
        counter('incoming-report.dmarc-report-with-warnings', 2),
        counter('incoming-report.tls-report-with-warnings', 7),
      ],
    });
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      id: 'dmarcReports',
      count: 5,
      title: 'DMARC reports with warnings',
      href: '/Management/x:DmarcExternalReport',
    });
    expect(items[1]).toMatchObject({
      id: 'tlsReports',
      count: 7,
      title: 'TLS reports with warnings',
      href: '/Management/x:TlsExternalReport',
    });
  });

  it('shows only the kind that has warnings', () => {
    const items = buildAttention({
      ...quiet,
      linkOf,
      samples: [counter('incoming-report.tls-report-with-warnings', 1)],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ id: 'tlsReports', count: 1, title: 'TLS report with warnings' });
  });
});
