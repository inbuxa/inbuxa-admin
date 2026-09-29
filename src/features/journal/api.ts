/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:Journal`, `inbuxa:JournalEntry`, `inbuxa:JournalExport`
 * and `inbuxa:JournalVerification` over JMAP (journaling spec, JR-6,
 * JR-9, JR-15, JR-16). Every search, read and export is recorded by the
 * server before it answers.
 */

import { apiFetch } from '@/services/api';
import { fetchSession, getAccountId, jmapRequest } from '@/services/jmap/client';
import { toServerFilter, type EntryFilter, type Journal, type JournalEntry } from './model';

const CAPABILITY = 'urn:inbuxa:jmap';

/** The server has no journal (an older server). */
export class JournalUnavailable extends Error {}

function failure(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  if (r?.type === 'unknownMethod' || r?.type === 'unknownCapability') return new JournalUnavailable(r.type);
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

async function call(
  method: string,
  args: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<Record<string, unknown>> {
  const responses = await jmapRequest([[method, { accountId: getAccountId('x:Account'), ...args }, '0']], signal, [
    CAPABILITY,
  ]);
  const [name, result] = responses[0] ?? [];
  if (name !== method) throw failure(name, result);
  return result as Record<string, unknown>;
}

function setFailure(result: Record<string, unknown>, bucket: string, key: string): Error | null {
  const failed = (
    result[bucket] as Record<string, { type?: string; description?: string; properties?: string[] }> | undefined
  )?.[key];
  if (!failed) return null;
  const where = failed.properties?.length ? ` (${failed.properties.join(', ')})` : '';
  return new Error(`${failed.description ?? failed.type ?? 'Not saved'}${where}`);
}

// --- Journals -------------------------------------------------------------

export async function fetchJournals(signal?: AbortSignal): Promise<Journal[]> {
  const result = await call('inbuxa:Journal/get', { ids: null }, signal);
  return (result.list as Journal[] | undefined) ?? [];
}

function toServer(journal: Journal): Record<string, unknown> {
  return {
    name: journal.name.trim(),
    description: journal.description,
    enabled: journal.enabled,
    direction: journal.direction,
    scope: journal.scope,
    retentionDays: journal.retentionDays,
    builtIn: journal.builtIn,
    archiveAddress: journal.archiveAddress?.trim() || null,
  };
}

export async function saveJournal(journal: Journal, reason?: string): Promise<void> {
  const args: Record<string, unknown> = reason?.trim() ? { reason: reason.trim() } : {};
  if (journal.id) {
    const result = await call('inbuxa:Journal/set', { ...args, update: { [journal.id]: toServer(journal) } });
    const failed = setFailure(result, 'notUpdated', journal.id);
    if (failed) throw failed;
    return;
  }
  const result = await call('inbuxa:Journal/set', { ...args, create: { j: toServer(journal) } });
  const failed = setFailure(result, 'notCreated', 'j');
  if (failed) throw failed;
}

export async function setJournalEnabled(journal: Journal, enabled: boolean): Promise<void> {
  if (!journal.id) return;
  const result = await call('inbuxa:Journal/set', { update: { [journal.id]: { enabled } } });
  const failed = setFailure(result, 'notUpdated', journal.id);
  if (failed) throw failed;
}

export async function deleteJournal(id: string): Promise<void> {
  const result = await call('inbuxa:Journal/set', { destroy: [id] });
  const failed = setFailure(result, 'notDestroyed', id);
  if (failed) throw failed;
}

// --- Entries --------------------------------------------------------------

export const PAGE = 50;

/** One page of matching entries, newest first, and how many match. */
export async function searchEntries(
  filter: EntryFilter,
  position: number,
  signal?: AbortSignal,
): Promise<{ entries: JournalEntry[]; total: number }> {
  const accountId = getAccountId('x:Account');
  const responses = await jmapRequest(
    [
      [
        'inbuxa:JournalEntry/query',
        { accountId, filter: toServerFilter(filter), position, limit: PAGE, calculateTotal: true },
        'q',
      ],
      [
        'inbuxa:JournalEntry/get',
        { accountId, '#ids': { resultOf: 'q', name: 'inbuxa:JournalEntry/query', path: '/ids' } },
        'g',
      ],
    ],
    signal,
    [CAPABILITY],
  );
  const [queryName, query] = responses[0] ?? [];
  if (queryName !== 'inbuxa:JournalEntry/query') throw failure(queryName, query);
  const total = (query as { total?: number }).total ?? 0;
  const [getName, get] = responses[1] ?? [];
  if (getName !== 'inbuxa:JournalEntry/get') {
    // No ids: the get has nothing to return
    if ((query as { ids?: string[] }).ids?.length === 0) return { entries: [], total };
    throw failure(getName, get);
  }
  return { entries: ((get as { list?: JournalEntry[] }).list ?? []) as JournalEntry[], total };
}

/** The whole journal report. Reading it is recorded. */
export async function fetchReport(id: string): Promise<string> {
  const result = await call('inbuxa:JournalEntry/get', { ids: [id], properties: ['report'] });
  const report = (result.list as { report?: string | null }[] | undefined)?.[0]?.report;
  if (typeof report !== 'string') throw new Error('The report couldn’t be read.');
  return report;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder');
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

function saveBlob(blob: Blob, fileName: string) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/** Asks for a ZIP of the matching reports, and saves it. */
export async function exportEntries(filter: EntryFilter, reason: string): Promise<{ count: number; sha256: string }> {
  const accountId = getAccountId('x:Account');
  const result = await call('inbuxa:JournalExport/set', {
    create: { x: { filter: toServerFilter(filter), reason: reason.trim() } },
  });
  const failed = setFailure(result, 'notCreated', 'x');
  if (failed) throw failed;
  const created = (result.created as { x?: { blobId: string; count: number; sha256: string } } | undefined)?.x;
  if (!created) throw new Error('Export failed');
  const fileName = `journal-${new Date().toISOString().slice(0, 10)}.zip`;
  const session = await fetchSession();
  const template =
    typeof session.downloadUrl === 'string'
      ? session.downloadUrl
      : '/jmap/download/{accountId}/{blobId}/{name}?accept={type}';
  const url = template
    .replace('{accountId}', encodeURIComponent(accountId))
    .replace('{blobId}', encodeURIComponent(created.blobId))
    .replace('{name}', encodeURIComponent(fileName))
    .replace('{type}', encodeURIComponent('application/zip'));
  const response = await apiFetch(pathOf(url));
  if (!response.ok) throw new Error(`Download failed (${response.status})`);
  saveBlob(await response.blob(), fileName);
  return { count: created.count, sha256: created.sha256 };
}

export interface ChainReport {
  node: number;
  entries: number;
  purged: number;
  brokenAt?: string;
  reason?: string;
}

/** Rechecks every chain and report. */
export async function verifyJournal(): Promise<{ verified: boolean; chains: ChainReport[] }> {
  const result = await call('inbuxa:JournalVerification/set', { create: { v: {} } });
  const created = (result.created as { v?: { verified: boolean; chains: ChainReport[] } } | undefined)?.v;
  if (!created) throw setFailure(result, 'notCreated', 'v') ?? new Error('The check didn’t run');
  return created;
}
