/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: every "how long is this kept" setting as one sentence
 * (settings-reorg, second wave). They live on x:DataRetention, spread over
 * four pages, plus log files on inbuxa:LogSettings.
 */

export type Group = 'mailboxes' | 'recovery' | 'records';

export interface Item {
  /** A property of x:DataRetention, or 'logs' for rotated log files. */
  field: string;
  group: Group;
  before: string;
  after?: string;
  /** What "no value" means for this setting. */
  none: string;
  hint?: string;
}

export const ITEMS: Item[] = [
  {
    field: 'expungeTrashAfter',
    group: 'mailboxes',
    before: 'Empty Trash and Junk after',
    none: 'never',
  },
  {
    field: 'expungeSchedulingInboxAfter',
    group: 'mailboxes',
    before: 'Clear handled calendar invitations after',
    none: 'never',
  },
  {
    field: 'expungeShareNotifyAfter',
    group: 'mailboxes',
    before: 'Forget “shared with you” notices after',
    none: 'never',
  },
  {
    field: 'expungeSubmissionsAfter',
    group: 'mailboxes',
    before: 'Forget the sending status of sent mail after',
    none: 'never',
    hint: 'What apps show as “delivered” or “failed”. The sent message itself stays.',
  },
  {
    field: 'archiveDeletedItemsFor',
    group: 'recovery',
    before: 'Let people get deleted mail, contacts and events back for',
    none: 'off: deleting is final',
  },
  {
    field: 'archiveDeletedAccountsFor',
    group: 'recovery',
    before: 'Keep a deleted account restorable for',
    none: 'off: deleting is final',
  },
  {
    field: 'holdTracesFor',
    group: 'records',
    before: 'Keep delivery history for',
    none: 'forever',
    hint: 'What Emails › History and “why was this rejected?” read from.',
  },
  {
    field: 'holdMetricsFor',
    group: 'records',
    before: 'Keep charts’ history for',
    none: 'forever',
  },
  {
    field: 'holdMtaReportsFor',
    group: 'records',
    before: 'Keep DMARC and TLS reports from other servers for',
    none: 'off: not stored',
  },
  {
    field: 'logs',
    group: 'records',
    before: 'Keep old log files for',
    none: 'forever',
    hint: 'Log files hold IP and email addresses.',
  },
];

export const RETENTION_FIELDS = ITEMS.filter((i) => i.field !== 'logs').map((i) => i.field);

export type Unit = 'hours' | 'days';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** A stored duration as a number and unit someone would type. */
export function toParts(ms: number): { n: number; unit: Unit } {
  if (ms % DAY === 0) return { n: ms / DAY, unit: 'days' };
  return { n: Math.max(1, Math.round(ms / HOUR)), unit: 'hours' };
}

export function fromParts(n: number, unit: Unit): number {
  return n * (unit === 'days' ? DAY : HOUR);
}

/** "30 days", "1 day", "12 hours". */
export function words(ms: number): string {
  const { n, unit } = toParts(ms);
  return `${n} ${n === 1 ? unit.slice(0, -1) : unit}`;
}
