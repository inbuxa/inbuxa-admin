/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Run, ScheduledReport } from './api';
import { isFailing, newReport, parseRecipients, scheduleText, timeZones } from './describe';

const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(options?.[k] ?? ''));

const base = { weekday: 1, dayOfMonth: 1, hour: 7, minute: 5, timeZone: 'UTC' };

describe('scheduleText', () => {
  it('reads the three frequencies', () => {
    expect(scheduleText({ ...base, frequency: 'daily' }, t, 'en-US')).toBe('Every day at 07:05 (UTC)');
    expect(scheduleText({ ...base, frequency: 'weekly' }, t, 'en-US')).toBe('Every Monday at 07:05 (UTC)');
    expect(scheduleText({ ...base, frequency: 'weekly', weekday: 7 }, t, 'en-US')).toBe('Every Sunday at 07:05 (UTC)');
    expect(scheduleText({ ...base, frequency: 'monthly', dayOfMonth: 28 }, t, 'en-US')).toBe(
      'Day 28 of each month at 07:05 (UTC)',
    );
  });
});

function report(runs: Partial<Run>[], enabled = true): ScheduledReport {
  return {
    id: 'a',
    name: 'R',
    enabled,
    builtIn: false,
    sections: ['storage'],
    schedule: { ...base, frequency: 'daily' },
    recipients: [],
    attachCsv: false,
    memberTenantId: null,
    createdAt: '',
    nextRunAt: null,
    runs: runs.map((r) => ({ at: '', byHand: false, status: 'sent', recipients: 1, size: 1, ...r })),
  };
}

describe('isFailing', () => {
  it('needs the last two scheduled runs to have failed', () => {
    expect(isFailing(report([{ status: 'failed' }, { status: 'failed' }]))).toBe(true);
    expect(isFailing(report([{ status: 'failed' }, { status: 'sent' }]))).toBe(false);
    expect(isFailing(report([{ status: 'failed' }]))).toBe(false);
    // A failed Send now in between doesn't count
    expect(isFailing(report([{ status: 'failed', byHand: true }, { status: 'failed' }, { status: 'sent' }]))).toBe(
      false,
    );
    // Off reports don't nag
    expect(isFailing(report([{ status: 'failed' }, { status: 'failed' }], false))).toBe(false);
  });
});

describe('helpers', () => {
  it('tidies recipients', () => {
    expect(parseRecipients(' Ada@Example.org,\nbob@example.org; ada@example.org ')).toEqual([
      'ada@example.org',
      'bob@example.org',
    ]);
  });

  it('keeps an unknown zone selectable and starts new reports sensibly', () => {
    expect(timeZones('Mars/Olympus')[0]).toBe('Mars/Olympus');
    expect(timeZones('UTC')).toContain('UTC');
    const r = newReport('me@example.org', 'Europe/Amsterdam');
    expect(r.recipients).toEqual(['me@example.org']);
    expect(r.sections).toHaveLength(8);
    expect(r.schedule.timeZone).toBe('Europe/Amsterdam');
  });
});
