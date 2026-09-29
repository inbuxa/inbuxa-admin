/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: journals and journal entries as the server sends them
 * (journaling spec, JR-3, JR-9, JR-15), and each journal in words.
 */

export type JournalDirection = 'outgoing' | 'incoming' | 'internal' | 'any';

export interface JournalScope {
  everyone: boolean;
  accounts: string[];
  groups: string[];
  domains: string[];
  tenants: string[];
}

export interface ArchiveFailures {
  count: number;
  lastAt: string | null;
  lastReason: string | null;
}

export interface Journal {
  id?: string;
  name: string;
  description: string;
  enabled: boolean;
  direction: JournalDirection;
  scope: JournalScope;
  retentionDays: number;
  builtIn: boolean;
  archiveAddress: string | null;
  archiveFailures?: ArchiveFailures;
  createdBy?: string;
  createdAt?: string;
}

export const MIN_RETENTION_DAYS = 30;
export const MAX_RETENTION_DAYS = 3650;

export function newJournal(): Journal {
  return {
    name: '',
    description: '',
    enabled: true,
    direction: 'any',
    scope: { everyone: true, accounts: [], groups: [], domains: [], tenants: [] },
    retentionDays: 365 * 7,
    builtIn: true,
    archiveAddress: null,
  };
}

/** Who a journal takes: everyone, chosen people, or only what rules send. */
export type Who = 'everyone' | 'chosen' | 'rules';

export function whoOf(scope: JournalScope): Who {
  if (scope.everyone) return 'everyone';
  const chosen = scope.accounts.length + scope.groups.length + scope.domains.length + scope.tenants.length;
  return chosen > 0 ? 'chosen' : 'rules';
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function list(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

/** "7 years", "90 days". */
export function retentionText(days: number): string {
  if (days % 365 === 0) return plural(days / 365, 'year', 'years');
  return plural(days, 'day', 'days');
}

/** "Journal mail sent outside by 2 groups into the built-in journal, kept 7 years." */
export function describeJournal(journal: Journal): string {
  const who = whoOf(journal.scope);
  const chosen = list(
    [
      journal.scope.accounts.length && plural(journal.scope.accounts.length, 'account', 'accounts'),
      journal.scope.groups.length && plural(journal.scope.groups.length, 'group', 'groups'),
      journal.scope.domains.length && plural(journal.scope.domains.length, 'domain', 'domains'),
      journal.scope.tenants.length && plural(journal.scope.tenants.length, 'tenant', 'tenants'),
    ].filter((part): part is string => Boolean(part)),
  );
  const people = who === 'everyone' ? 'everyone' : `people in ${chosen}`;
  const what =
    who === 'rules'
      ? 'what mail flow and DLP rules send here'
      : journal.direction === 'outgoing'
        ? `mail sent outside by ${people}`
        : journal.direction === 'incoming'
          ? `mail arriving from outside for ${people}`
          : journal.direction === 'internal'
            ? `mail ${people === 'everyone' ? 'between people here' : `from ${people} to people here`}`
            : `all mail to and from ${people}`;
  const archive = journal.archiveAddress?.trim();
  const where =
    journal.builtIn && archive
      ? `into the built-in journal and to ${archive}`
      : archive
        ? `to ${archive}`
        : 'into the built-in journal';
  return `Journal ${what} ${where}, kept ${retentionText(journal.retentionDays)}.`;
}

/** What a journal needs before it can be saved; null when it's ready. */
export function problem(journal: Journal): string | null {
  if (!journal.name.trim()) return 'Give the journal a name.';
  if (
    !Number.isInteger(journal.retentionDays) ||
    journal.retentionDays < MIN_RETENTION_DAYS ||
    journal.retentionDays > MAX_RETENTION_DAYS
  )
    return `Keep entries between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days.`;
  if (whoOf(journal.scope) === 'chosen' && journal.scope.everyone) return 'Choose everyone or chosen people.';
  if (!journal.builtIn && !journal.archiveAddress?.trim())
    return 'Keep entries in the built-in journal, send them to an archive, or both.';
  if (journal.archiveAddress?.trim() && !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(journal.archiveAddress.trim()))
    return 'The archive address isn’t an email address.';
  return null;
}

export interface JournalEntry {
  id: string;
  receivedAt: string;
  direction: Exclude<JournalDirection, 'any'>;
  sender: string;
  authenticated: boolean;
  recipients: string[];
  subject: string;
  messageId: string;
  journalIds: string[];
  held: boolean;
  size: number;
  sha256: string;
  expiresAt: string;
}

/** A search of the journal. Dates are YYYY-MM-DD, whole days. */
export interface EntryFilter {
  text: string;
  address: string;
  direction: JournalDirection;
  from: string;
  to: string;
  journalId: string;
}

export function emptyFilter(): EntryFilter {
  return { text: '', address: '', direction: 'any', from: '', to: '', journalId: '' };
}

/** The filter as the server takes it; `to` includes that whole day. */
export function toServerFilter(filter: EntryFilter): Record<string, string> {
  const out: Record<string, string> = {};
  if (filter.text.trim()) out.text = filter.text.trim();
  if (filter.address.trim()) out.address = filter.address.trim();
  if (filter.direction !== 'any') out.direction = filter.direction;
  if (filter.from) out.after = `${filter.from}T00:00:00Z`;
  if (filter.to) {
    const next = new Date(`${filter.to}T00:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    out.before = next.toISOString().replace(/\.\d{3}Z$/, 'Z');
  }
  if (filter.journalId) out.journalId = filter.journalId;
  return out;
}
