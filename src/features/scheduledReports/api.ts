/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: scheduled reports and the weekly digest (scheduled-reports spec):
 * `inbuxa:ScheduledReport`, `inbuxa:ScheduledReportSettings` and the
 * download, `inbuxa:ReportExport`.
 */

import { apiFetch } from '@/services/api';
import { fetchSession, getAccountId, jmapRequest } from '@/services/jmap/client';
import { INBUXA_CAPABILITY } from '@/features/hardening/protocolPolicy';

export type SectionName =
  'mailFlow' | 'queue' | 'spoofing' | 'tlsFailures' | 'deliverability' | 'security' | 'storage' | 'certificates';

export type Frequency = 'daily' | 'weekly' | 'monthly';

export interface Schedule {
  frequency: Frequency;
  /** 1 = Monday … 7 = Sunday. */
  weekday: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  timeZone: string;
}

export interface Run {
  at: string;
  byHand: boolean;
  status: 'sent' | 'failed';
  reason?: string | null;
  recipients: number;
  size: number;
}

export interface ScheduledReport {
  id: string;
  name: string;
  enabled: boolean;
  builtIn: boolean;
  sections: SectionName[];
  schedule: Schedule;
  recipients: string[];
  attachCsv: boolean;
  memberTenantId: string | null;
  createdAt: string;
  nextRunAt: string | null;
  runs: Run[];
}

export type ReportInput = Pick<ScheduledReport, 'name' | 'sections' | 'schedule' | 'recipients' | 'attachCsv'> & {
  enabled?: boolean;
};

export interface ReportSettings {
  fromName: string;
  fromAddress: string;
}

/** The server doesn't have scheduled reports (an older version). */
export class ScheduledReportsUnavailable extends Error {}

async function call(method: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
  const responses = await jmapRequest([[method, { accountId: getAccountId('x:Domain'), ...args }, '0']], undefined, [
    INBUXA_CAPABILITY,
  ]);
  const [name, result] = responses[0] ?? [];
  if (name !== method) {
    const r = result as { type?: string; description?: string } | undefined;
    if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') throw new ScheduledReportsUnavailable(r.type);
    throw new Error(r?.description ?? r?.type ?? 'Request failed');
  }
  return result as Record<string, unknown>;
}

type SetFailure = Record<string, { description?: string; type?: string } | undefined> | undefined;

function failed(map: SetFailure, key: string): string | null {
  const f = map?.[key];
  return f ? (f.description ?? f.type ?? 'Refused') : null;
}

export async function fetchReports(): Promise<ScheduledReport[]> {
  const result = await call('inbuxa:ScheduledReport/get', { ids: null });
  return ((result.list as ScheduledReport[]) ?? []).sort(
    (a, b) => Number(b.builtIn) - Number(a.builtIn) || a.name.localeCompare(b.name),
  );
}

export async function createReport(input: ReportInput): Promise<string> {
  const result = await call('inbuxa:ScheduledReport/set', { create: { new: input } });
  const created = (result.created as Record<string, { id: string }> | undefined)?.new;
  if (!created) throw new Error(failed(result.notCreated as SetFailure, 'new') ?? 'Not created');
  return created.id;
}

export async function updateReport(id: string, patch: Partial<ReportInput> & { sendNow?: boolean }): Promise<void> {
  const result = await call('inbuxa:ScheduledReport/set', { update: { [id]: patch } });
  const why = failed(result.notUpdated as SetFailure, id);
  if (why) throw new Error(why);
}

export async function destroyReports(ids: string[]): Promise<{ destroyed: string[]; errors: Record<string, string> }> {
  const result = await call('inbuxa:ScheduledReport/set', { destroy: ids });
  const errors: Record<string, string> = {};
  for (const id of ids) {
    const why = failed(result.notDestroyed as SetFailure, id);
    if (why) errors[id] = why;
  }
  return { destroyed: (result.destroyed as string[]) ?? [], errors };
}

export async function fetchSettings(): Promise<ReportSettings> {
  const result = await call('inbuxa:ScheduledReportSettings/get', { ids: null });
  return (result.list as ReportSettings[] | undefined)?.[0] ?? { fromName: '', fromAddress: '' };
}

export async function updateSettings(patch: Partial<ReportSettings>): Promise<void> {
  const result = await call('inbuxa:ScheduledReportSettings/set', { update: { singleton: patch } });
  const why = failed(result.notUpdated as SetFailure, 'singleton');
  if (why) throw new Error(why);
}

/** RP-19: builds the report for a period and saves it as a ZIP. */
export async function downloadReport(report: ScheduledReport, from?: Date, to?: Date): Promise<void> {
  const create: Record<string, unknown> = { reportId: report.id };
  if (from) create.from = from.toISOString().replace(/\.\d+Z$/, 'Z');
  if (to) create.to = to.toISOString().replace(/\.\d+Z$/, 'Z');
  const result = await call('inbuxa:ReportExport/set', { create: { x: create } });
  const created = (result.created as Record<string, { blobId: string }> | undefined)?.x;
  if (!created) throw new Error(failed(result.notCreated as SetFailure, 'x') ?? 'Not built');

  const slug =
    report.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'report';
  const fileName = `${slug}-${new Date().toISOString().slice(0, 10)}.zip`;
  const session = await fetchSession();
  const template =
    typeof session.downloadUrl === 'string'
      ? session.downloadUrl
      : '/jmap/download/{accountId}/{blobId}/{name}?accept={type}';
  const url = template
    .replace('{accountId}', encodeURIComponent(getAccountId('x:Domain')))
    .replace('{blobId}', encodeURIComponent(created.blobId))
    .replace('{name}', encodeURIComponent(fileName))
    .replace('{type}', encodeURIComponent('application/zip'));
  let path = url;
  try {
    const u = new URL(url, 'http://placeholder');
    path = u.pathname + u.search;
  } catch {
    // a relative template is already a path
  }
  const response = await apiFetch(path);
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  const href = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
