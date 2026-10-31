/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:Migration` as the server sends it (inbuxa-server
 * docs/spec/features/migrations.md), the form the console asks it with,
 * which actions a migration can take now, and what about it needs
 * attention. Nothing here talks to the server.
 */

export type SourceKind = 'imap' | 'jmap' | 'microsoft' | 'google';
export type RunKind = 'preview' | 'move' | 'finalPass';
export type RunResult = 'done' | 'unfinished' | 'failed' | 'stopped' | 'interrupted';
export type Status = 'idle' | 'running' | 'closed';
export type Action = RunKind | 'stop' | 'close' | 'passwords';

export interface Source {
  url: string;
  login: string;
  cleartext: boolean;
  tenant: string;
  clientId: string;
}

export interface Progress {
  total: number;
  finished: number;
  unfinished: number;
  read: number;
  written: number;
  failed: number;
}

export interface Failure {
  email: string;
  step: string;
  detail: string;
}

export interface Migration {
  id: string;
  description: string;
  sourceKind: SourceKind;
  source: Source;
  accounts: string[];
  createAccounts: boolean;
  parallel: number;
  status: Status;
  run: RunKind | null;
  result: RunResult | null;
  error: string | null;
  progress: Progress;
  failures: Failure[];
  nodeId: string | null;
  heartbeat: string | null;
  moved: boolean;
  diskUsed: number;
  passwordsWaiting: boolean;
  reportBlobId: string | null;
  createdAt: string;
  createdBy: string;
  startedAt: string | null;
  finishedAt: string | null;
}

const SOURCE_KINDS: SourceKind[] = ['imap', 'jmap', 'microsoft', 'google'];
const RUN_KINDS: RunKind[] = ['preview', 'move', 'finalPass'];
const RESULTS: RunResult[] = ['done', 'unfinished', 'failed', 'stopped', 'interrupted'];
const STATUSES: Status[] = ['idle', 'running', 'closed'];

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const maybe = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const oneOf = <T extends string>(v: unknown, values: T[]): T | null => (values.includes(v as T) ? (v as T) : null);

/** A migration from `inbuxa:Migration/get`, with every field there. */
export function fromServer(item: Record<string, unknown>): Migration {
  const source = (item.source ?? {}) as Record<string, unknown>;
  const progress = (item.progress ?? {}) as Record<string, unknown>;
  return {
    id: text(item.id),
    description: text(item.description),
    sourceKind: oneOf(item.sourceKind, SOURCE_KINDS) ?? 'imap',
    source: {
      url: text(source.url),
      login: text(source.login),
      cleartext: source.cleartext === true,
      tenant: text(source.tenant),
      clientId: text(source.clientId),
    },
    accounts: Array.isArray(item.accounts) ? item.accounts.map(String) : [],
    createAccounts: item.createAccounts === true,
    parallel: count(item.parallel) || 4,
    status: oneOf(item.status, STATUSES) ?? 'idle',
    run: oneOf(item.run, RUN_KINDS),
    result: oneOf(item.result, RESULTS),
    error: maybe(item.error),
    progress: {
      total: count(progress.total),
      finished: count(progress.finished),
      unfinished: count(progress.unfinished),
      read: count(progress.read),
      written: count(progress.written),
      failed: count(progress.failed),
    },
    failures: Array.isArray(item.failures)
      ? (item.failures as Record<string, unknown>[]).map((f) => ({
          email: text(f.email),
          step: text(f.step),
          detail: text(f.detail),
        }))
      : [],
    nodeId: maybe(item.nodeId),
    heartbeat: maybe(item.heartbeat),
    moved: item.moved === true,
    diskUsed: count(item.diskUsed),
    passwordsWaiting: item.passwordsWaiting === true,
    reportBlobId: maybe(item.reportBlobId),
    createdAt: text(item.createdAt),
    createdBy: text(item.createdBy),
    startedAt: maybe(item.startedAt),
    finishedAt: maybe(item.finishedAt),
  };
}

/** Running first, then the newest; closed ones last. */
export function ordered(list: Migration[]): Migration[] {
  const rank = (m: Migration) => (m.status === 'running' ? 0 : m.status === 'idle' ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || b.createdAt.localeCompare(a.createdAt));
}

// --- The form -----------------------------------------------------------------

export interface MigrationForm {
  description: string;
  sourceKind: SourceKind;
  url: string;
  login: string;
  cleartext: boolean;
  tenant: string;
  clientId: string;
  /** The accounts as typed or read from a file: one per line, or separated by commas. */
  accounts: string;
  createAccounts: boolean;
  parallel: number;
}

export function emptyForm(): MigrationForm {
  return {
    description: '',
    sourceKind: 'imap',
    url: '',
    login: '{email}*master',
    cleartext: false,
    tenant: '',
    clientId: '',
    accounts: '',
    createAccounts: true,
    parallel: 4,
  };
}

export function toForm(m: Migration): MigrationForm {
  return {
    description: m.description,
    sourceKind: m.sourceKind,
    url: m.source.url,
    login: m.source.login,
    cleartext: m.source.cleartext,
    tenant: m.source.tenant,
    clientId: m.source.clientId,
    accounts: m.accounts.join('\n'),
    createAccounts: m.createAccounts,
    parallel: m.parallel,
  };
}

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;

/**
 * The addresses in pasted text or a CSV: the first thing on each line that
 * looks like one, lowercased, each once. A header row has none, so it's
 * skipped; `bad` holds what looked meant as an address and wasn't one.
 */
export function parseAccounts(input: string): { accounts: string[]; bad: string[] } {
  const accounts: string[] = [];
  const bad: string[] = [];
  for (const line of input.split(/\r?\n/)) {
    for (const cell of line.split(/[,;\t]/)) {
      const value = cell.trim().replace(/^"|"$/g, '').trim().toLowerCase();
      if (!value) continue;
      if (EMAIL.test(value)) {
        if (!accounts.includes(value)) accounts.push(value);
        break;
      }
      if (value.includes('@')) {
        bad.push(value);
        break;
      }
    }
  }
  return { accounts, bad };
}

/** The login has to name each account, or every account would open the same mailbox. */
export function namesAccount(login: string): boolean {
  return login.includes('{email}') || login.includes('{local}');
}

export type FormProblem =
  'imapUrl' | 'imapLogin' | 'jmapUrl' | 'microsoft' | 'noAccounts' | 'badAccounts' | 'tooManyAccounts' | 'parallel';

/** The first thing the server would refuse, so the form can say it first. */
export function formProblem(f: MigrationForm): FormProblem | null {
  if (f.sourceKind === 'imap') {
    if (!/^imaps?:\/\/\S+$/.test(f.url.trim())) return 'imapUrl';
    if (!namesAccount(f.login)) return 'imapLogin';
  }
  if (f.sourceKind === 'jmap' && !/^https?:\/\/\S+$/.test(f.url.trim())) return 'jmapUrl';
  if (f.sourceKind === 'microsoft' && (!f.tenant.trim() || !f.clientId.trim())) return 'microsoft';
  const { accounts, bad } = parseAccounts(f.accounts);
  if (bad.length) return 'badAccounts';
  if (!accounts.length) return 'noAccounts';
  if (accounts.length > 10_000) return 'tooManyAccounts';
  if (!Number.isInteger(f.parallel) || f.parallel < 1 || f.parallel > 16) return 'parallel';
  return null;
}

/** The source fields a kind uses; the others go empty, so an old answer isn't kept by mistake. */
function sourceOf(f: MigrationForm): Source {
  const kind = f.sourceKind;
  return {
    url: kind === 'imap' || kind === 'jmap' ? f.url.trim() : '',
    login: kind === 'imap' || kind === 'jmap' ? f.login.trim() : '',
    cleartext: kind === 'imap' && f.cleartext,
    tenant: kind === 'microsoft' ? f.tenant.trim() : '',
    clientId: kind === 'microsoft' ? f.clientId.trim() : '',
  };
}

/** The object to create from the form. */
export function toCreate(f: MigrationForm): Record<string, unknown> {
  return {
    description: f.description.trim(),
    sourceKind: f.sourceKind,
    source: sourceOf(f),
    accounts: parseAccounts(f.accounts).accounts,
    createAccounts: f.createAccounts,
    parallel: f.parallel,
  };
}

/**
 * What changed, as an update. Once accounts were moved the source stays
 * as it is: a new source would be a new migration.
 */
export function toPatch(f: MigrationForm, m: Migration): Record<string, unknown> {
  const next = toCreate(f);
  const before = toCreate(toForm(m));
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(next)) {
    if (m.moved && (key === 'sourceKind' || key === 'source')) continue;
    if (JSON.stringify(next[key]) !== JSON.stringify(before[key])) patch[key] = next[key];
  }
  return patch;
}

// --- What it can do now -------------------------------------------------------

export interface Actions {
  preview: boolean;
  move: boolean;
  finalPass: boolean;
  stop: boolean;
  edit: boolean;
  close: boolean;
  passwords: boolean;
  report: boolean;
  /** Give the source's secret again, as a wrong one stays until replaced. */
  newSecret: boolean;
}

export function actions(m: Migration): Actions {
  const idle = m.status === 'idle';
  return {
    preview: idle,
    move: idle,
    finalPass: idle && m.moved,
    stop: m.status === 'running',
    edit: idle,
    close: idle,
    passwords: m.passwordsWaiting && m.status !== 'closed',
    report: !!m.reportBlobId && m.status !== 'running',
    newSecret: idle && m.run !== null,
  };
}

/** The runs a migration can start now, for the new-secret dialog. */
export function startable(m: Migration): RunKind[] {
  const can = actions(m);
  return (['preview', 'move', 'finalPass'] as RunKind[]).filter((run) => can[run]);
}

/** A move that was cut short carries on where it stopped. */
export function resumes(m: Migration): boolean {
  return m.run === 'move' && (m.result === 'unfinished' || m.result === 'stopped' || m.result === 'interrupted');
}

/** The secret each kind of source asks for, for the dialog's wording. */
export type SecretKind = 'password' | 'apiKey' | 'clientSecret' | 'googleKey';

export function secretKind(m: Pick<Migration, 'sourceKind' | 'source'>): SecretKind {
  switch (m.sourceKind) {
    case 'imap':
      return 'password';
    case 'jmap':
      return m.source.login.trim() ? 'password' : 'apiKey';
    case 'microsoft':
      return 'clientSecret';
    case 'google':
      return 'googleKey';
  }
}

/** A Google key file holds a service account's key: its JSON, with a private key in it. */
export function looksLikeGoogleKey(text: string): boolean {
  try {
    const key = JSON.parse(text) as Record<string, unknown>;
    return (
      key.type === 'service_account' && typeof key.private_key === 'string' && typeof key.client_email === 'string'
    );
  } catch {
    return false;
  }
}

// --- Attention ----------------------------------------------------------------

export type Attention =
  | { kind: 'failed'; error: string }
  | { kind: 'unfinished'; count: number }
  | { kind: 'interrupted' }
  | { kind: 'passwords' }
  | { kind: 'quiet'; since: string };

/** A running migration whose node hasn't written for this long has likely stopped. */
const QUIET_MS = 2 * 60_000;

/** What needs someone: nothing at all when a migration is fine. */
export function attention(m: Migration, now: Date = new Date()): Attention[] {
  if (m.status === 'closed') return [];
  const out: Attention[] = [];
  if (m.status === 'running') {
    const beat = m.heartbeat ?? m.startedAt;
    if (beat && now.getTime() - new Date(beat).getTime() > QUIET_MS) out.push({ kind: 'quiet', since: beat });
    return out;
  }
  if (m.result === 'failed') out.push({ kind: 'failed', error: m.error ?? '' });
  if (m.result === 'unfinished') out.push({ kind: 'unfinished', count: m.progress.unfinished || m.failures.length });
  if (m.result === 'interrupted') out.push({ kind: 'interrupted' });
  if (m.passwordsWaiting) out.push({ kind: 'passwords' });
  return out;
}

/** Done of the total, from 0 to 100, for the progress bar. */
export function percent(p: Progress): number {
  if (!p.total) return 0;
  return Math.min(100, Math.round(((p.finished + p.unfinished) / p.total) * 100));
}

/** A name for a downloaded file of this migration. */
export function fileName(m: Migration, what: 'report' | 'passwords'): string {
  const slug = m.description.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'migration';
  return `${slug}-${m.id}-${what}.csv`;
}
