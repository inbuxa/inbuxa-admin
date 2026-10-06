/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** inbuxa: how scheduled reports read on the page (scheduled-reports spec). */

import type { ReportInput, Schedule, ScheduledReport, SectionName } from './api';

type TFn = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** In the order the mail shows them. */
export const SECTIONS: SectionName[] = [
  'mailFlow',
  'queue',
  'spoofing',
  'tlsFailures',
  'deliverability',
  'security',
  'storage',
  'certificates',
];

/** RP-12: server-wide, so a tenant's report leaves them out. */
export const SERVER_WIDE = new Set<SectionName>(['mailFlow', 'queue', 'security', 'certificates']);

const pad = (n: number) => String(n).padStart(2, '0');

/** "Mondays at 07:00 (UTC)". Weekday names come from the browser's locale. */
export function scheduleText(s: Schedule, t: TFn, locale?: string): string {
  const time = `${pad(s.hour)}:${pad(s.minute)}`;
  const zone = s.timeZone;
  if (s.frequency === 'daily') return t('sched.daily', 'Every day at {{time}} ({{zone}})', { time, zone });
  if (s.frequency === 'monthly') {
    return t('sched.monthly', 'Day {{day}} of each month at {{time}} ({{zone}})', { day: s.dayOfMonth, time, zone });
  }
  // 2026-10-05 is a Monday; weekday 1 = Monday
  const day = new Date(Date.UTC(2026, 9, 4 + s.weekday)).toLocaleDateString(locale, {
    weekday: 'long',
    timeZone: 'UTC',
  });
  return t('sched.weekly', 'Every {{day}} at {{time}} ({{zone}})', { day, time, zone });
}

/** RP-17: the last two scheduled runs both failed. */
export function isFailing(report: ScheduledReport): boolean {
  const scheduled = report.runs.filter((r) => !r.byHand);
  return (
    report.enabled && scheduled.length >= 2 && scheduled[0].status === 'failed' && scheduled[1].status === 'failed'
  );
}

export function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Every IANA zone the browser knows, with the given one first if missing. */
export function timeZones(current: string): string[] {
  let zones: string[];
  try {
    zones = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') ?? [];
  } catch {
    zones = [];
  }
  if (!zones.includes('UTC')) zones = ['UTC', ...zones];
  return zones.includes(current) ? zones : [current, ...zones];
}

/** A new report's starting point: a weekly summary of everything, to me. */
export function newReport(me: string | null, zone: string): ReportInput {
  return {
    name: '',
    sections: [...SECTIONS],
    schedule: { frequency: 'weekly', weekday: 1, dayOfMonth: 1, hour: 8, minute: 0, timeZone: zone },
    recipients: me ? [me] : [],
    attachCsv: false,
    enabled: true,
  };
}

/** Addresses typed one per line or separated by commas, tidied. */
export function parseRecipients(text: string): string[] {
  return [
    ...new Set(
      text
        .split(/[\s,;]+/)
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
}
