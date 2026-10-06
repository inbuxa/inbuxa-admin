/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:HoldExport` over JMAP (audit-hold-lock spec, LH-12):
 * collecting what a legal hold keeps as a ZIP, in the background. The file is
 * the blob of whoever started it, so only they download it.
 */

import { apiFetch } from '@/services/api';
import { fetchSession, getAccountId, jmapRequest } from '@/services/jmap/client';

const CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:HoldExport';

export type ExportStatus = 'running' | 'ready' | 'failed';

export interface HoldExport {
  id: string;
  holdId: string;
  accountIds: string[];
  reason: string;
  status: ExportStatus;
  createdAt: string;
  createdBy: string;
  finishedAt: string | null;
  blobId: string | null;
  size: number;
  items: number;
  sha256: string | null;
  error: string | null;
}

function fromServer(item: Record<string, unknown>): HoldExport {
  const text = (v: unknown) => (typeof v === 'string' ? v : null);
  const status = String(item.status);
  return {
    id: String(item.id),
    holdId: String(item.holdId),
    accountIds: Array.isArray(item.accountIds) ? item.accountIds.map(String) : [],
    reason: text(item.reason) ?? '',
    status: status === 'ready' || status === 'failed' ? status : 'running',
    createdAt: text(item.createdAt) ?? '',
    createdBy: text(item.createdBy) ?? '',
    finishedAt: text(item.finishedAt),
    blobId: text(item.blobId),
    size: typeof item.size === 'number' ? item.size : 0,
    items: typeof item.items === 'number' ? item.items : 0,
    sha256: text(item.sha256),
    error: text(item.error),
  };
}

function failure(name: string | undefined, result: unknown): Error {
  const r = result as { type?: string; description?: string } | undefined;
  return new Error(r?.description ?? r?.type ?? `${name ?? 'Request'} failed`);
}

/** Every export, newest first. */
export async function fetchExports(signal?: AbortSignal): Promise<HoldExport[]> {
  const responses = await jmapRequest(
    [[`${OBJECT}/get`, { accountId: getAccountId('x:Account'), ids: null }, '0']],
    signal,
    [CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) throw failure(name, result);
  return ((result as { list?: Record<string, unknown>[] }).list ?? []).map(fromServer);
}

/** Starts collecting what `holdId` keeps, for `accountIds` or all it covers. */
export async function startExport(holdId: string, accountIds: string[], reason: string): Promise<string> {
  const create: Record<string, unknown> = { holdId, reason: reason.trim() };
  if (accountIds.length) create.accountIds = accountIds;
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId: getAccountId('x:Account'), create: { x: create } }, '0']],
    undefined,
    [CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw failure(name, result);
  const r = result as {
    created?: { x?: { id: string } };
    notCreated?: { x?: { description?: string; type?: string } };
  };
  if (!r.created?.x) throw new Error(r.notCreated?.x?.description ?? r.notCreated?.x?.type ?? 'Not started');
  return r.created.x.id;
}

/** A name for the downloaded file. */
export function exportFileName(holdName: string, exp: HoldExport): string {
  const slug = holdName.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'hold';
  return `${slug}-${exp.createdAt.slice(0, 10)}-${exp.id}.zip`;
}

function pathOf(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder');
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Downloads a ready export: the signed-in person's own blob. */
export async function downloadExport(exp: HoldExport, fileName: string): Promise<void> {
  if (!exp.blobId) throw new Error('This export has no file.');
  const session = await fetchSession();
  const template =
    typeof session.downloadUrl === 'string'
      ? session.downloadUrl
      : '/jmap/download/{accountId}/{blobId}/{name}?accept={type}';
  const url = template
    .replace('{accountId}', encodeURIComponent(getAccountId('x:Account')))
    .replace('{blobId}', encodeURIComponent(exp.blobId))
    .replace('{name}', encodeURIComponent(fileName))
    .replace('{type}', encodeURIComponent('application/zip'));
  const response = await apiFetch(pathOf(url));
  if (!response.ok) {
    throw new Error(
      response.status === 404 || response.status === 403
        ? `The file has expired, or it's ${exp.createdBy}'s to download. Start a new export.`
        : `Download failed (${response.status})`,
    );
  }
  const href = URL.createObjectURL(await response.blob());
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
