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
