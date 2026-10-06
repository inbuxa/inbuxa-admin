/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The theme follows the account, the same way INBUXA webmail's does: from
 * `settings.json` in the account's own JMAP Files, inside the `ihasmail`
 * folder. The two apps read and write the same keys, so a palette picked in
 * either is the one both open with, on any device.
 *
 * The admin touches only the theme's keys: `palette`, `mode`, and the derived
 * `theme` that older webmail builds read. Everything else in the file is the
 * webmail's and is written back exactly as it was read, from a fresh read
 * made just before each write. localStorage stays as the cache that paints
 * the first frame, as in the webmail.
 */
import { apiFetch } from '@/services/api';
import { jmapRequest } from '@/services/jmap/client';
import { isPaletteId, type PaletteId } from '@/lib/palettes';

const FILENODE = 'urn:ietf:params:jmap:filenode';
const APP_FOLDER = 'ihasmail';
const FILE = 'settings.json';
const TYPE = 'application/json';
const DEBOUNCE_MS = 1500;

type Mode = 'system' | 'light' | 'dark';

interface Target {
  accountId: string;
  uploadUrl: string;
  downloadUrl: string;
}

let target: Target | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
/** `mode` is set only when the user picked light or dark; a palette change keeps the stored mode. */
interface Choice {
  palette: PaletteId;
  mode: Mode | null;
  fallbackMode: Mode;
}
let pending: Choice | null = null;
let chain: Promise<void> = Promise.resolve();

/** A server URL, as a path for apiFetch (which adds the API base). */
function pathOf(url: string): string {
  try {
    const u = new URL(url, 'http://placeholder');
    return u.pathname + u.search;
  } catch {
    return url;
  }
}

/** Remember where the account's Files are, from the JMAP session. Null turns syncing off. */
export function setAccountSettingsTarget(session: Record<string, unknown> | null): void {
  const primary = (session?.primaryAccounts ?? {}) as Record<string, string>;
  const accountId = primary[FILENODE];
  const uploadUrl = session?.uploadUrl;
  const downloadUrl = session?.downloadUrl;
  target =
    accountId && typeof uploadUrl === 'string' && typeof downloadUrl === 'string'
      ? { accountId, uploadUrl, downloadUrl }
      : null;
  if (!target) {
    pending = null;
    if (timer) clearTimeout(timer);
    timer = null;
  }
}

async function call<T>(method: string, args: Record<string, unknown>): Promise<T> {
  const [res] = await jmapRequest([[method, args, '0']], undefined, [FILENODE]);
  if (!res || res[0] === 'error') throw new Error(`${method} failed`);
  return res[1] as T;
}

interface Node {
  id: string;
  name: string;
  parentId?: string | null;
  nodeType?: string;
  blobId?: string | null;
}

async function children(t: Target, parentId: string | null): Promise<Node[]> {
  const filter = parentId ? { parentId } : { isTopLevel: true };
  const responses = await jmapRequest(
    [
      ['FileNode/query', { accountId: t.accountId, filter, limit: 1000 }, 'q'],
      [
        'FileNode/get',
        {
          accountId: t.accountId,
          '#ids': { resultOf: 'q', name: 'FileNode/query', path: '/ids' },
          properties: ['id', 'name', 'parentId', 'nodeType', 'blobId'],
        },
        'g',
      ],
    ],
    undefined,
    [FILENODE],
  );
  const get = responses.find((r) => r[2] === 'g');
  if (!get || get[0] === 'error') throw new Error('FileNode/get failed');
  return ((get[1] as { list?: Node[] }).list ?? []) as Node[];
}

async function findFolder(t: Target): Promise<string | null> {
  const top = await children(t, null);
  return top.find((n) => n.name === APP_FOLDER && !n.parentId && n.nodeType === 'directory')?.id ?? null;
}

async function readFile(
  t: Target,
  folderId: string | null,
): Promise<{ node: Node | null; body: Record<string, unknown> }> {
  if (!folderId) return { node: null, body: {} };
  const node = (await children(t, folderId)).find((n) => n.name === FILE && n.parentId === folderId) ?? null;
  if (!node?.blobId) return { node, body: {} };
  const url = t.downloadUrl
    .replace('{accountId}', encodeURIComponent(t.accountId))
    .replace('{blobId}', encodeURIComponent(node.blobId))
    .replace('{name}', FILE)
    .replace('{type}', encodeURIComponent(TYPE));
  const res = await apiFetch(pathOf(url));
  if (!res.ok) throw new Error(`settings download failed (${res.status})`);
  const parsed = (await res.json()) as unknown;
  return {
    node,
    body: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {},
  };
}

/** The account's theme, or null when there is none to read (no file, no Files, a failure). */
export async function loadAccountTheme(): Promise<{ palette: PaletteId | null; mode: Mode | null } | null> {
  const t = target;
  if (!t) return null;
  try {
    const { body } = await readFile(t, await findFolder(t));
    const palette = isPaletteId(body.palette) ? body.palette : null;
    const mode = body.mode === 'light' || body.mode === 'dark' || body.mode === 'system' ? body.mode : null;
    if (!palette && !mode) return null;
    return { palette, mode };
  } catch {
    // A settings file we can't read must never cost anyone the admin; the cache stands.
    return null;
  }
}

/** The old single-value `theme`, derived exactly as the webmail does (its lib/palette.ts). */
function legacyTheme(palette: PaletteId, mode: Mode, prefersDark: boolean): 'system' | 'light' | 'dark' | 'ihasmail' {
  const effective = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
  if (palette === 'ihasmail' && effective === 'dark') return 'ihasmail';
  if (palette === 'default' && mode === 'system') return 'system';
  return effective;
}

async function write(t: Target, choice: Choice): Promise<void> {
  let folderId = await findFolder(t);
  if (!folderId) {
    const created = await call<{ created?: Record<string, { id: string }> }>('FileNode/set', {
      accountId: t.accountId,
      create: { d: { parentId: null, name: APP_FOLDER, nodeType: 'directory' } },
    });
    folderId = created.created?.d?.id ?? null;
    if (!folderId) throw new Error('could not create the settings folder');
  }
  const { node, body } = await readFile(t, folderId);
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const stored = body.mode === 'light' || body.mode === 'dark' || body.mode === 'system' ? body.mode : null;
  const mode = choice.mode ?? stored ?? choice.fallbackMode;
  const next = { ...body, palette: choice.palette, mode, theme: legacyTheme(choice.palette, mode, prefersDark) };
  const json = JSON.stringify(next, null, 2);
  const blob = new Blob([json], { type: TYPE });
  const up = await apiFetch(pathOf(t.uploadUrl.replace('{accountId}', encodeURIComponent(t.accountId))), {
    method: 'POST',
    headers: { 'Content-Type': TYPE },
    body: blob,
  });
  if (!up.ok) throw new Error(`settings upload failed (${up.status})`);
  const { blobId } = (await up.json()) as { blobId: string };
  if (node) {
    await call('FileNode/set', {
      accountId: t.accountId,
      update: { [node.id]: { blobId, type: TYPE, size: blob.size } },
    });
  } else {
    await call('FileNode/set', {
      accountId: t.accountId,
      create: { s: { parentId: folderId, name: FILE, blobId, type: TYPE, nodeType: 'file' } },
    });
  }
}

/**
 * Queue the theme for the account. `mode` is null for a palette-only change, which keeps the
 * account's stored mode (a webmail "system" stays "system"); `fallbackMode` is used only when
 * nothing is stored. Coalesces: the newest choice wins, one write after changes stop.
 */
export function queueAccountTheme(palette: PaletteId, mode: Mode | null, fallbackMode: Mode): void {
  if (!target) return;
  pending = { palette, mode: mode ?? pending?.mode ?? null, fallbackMode };
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    const t = target;
    const choice = pending;
    pending = null;
    if (!t || !choice) return;
    // One write at a time, in order.
    chain = chain.then(() => write(t, choice)).catch(() => undefined);
  }, DEBOUNCE_MS);
}
