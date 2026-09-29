/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { describeJournal, newJournal, problem, retentionText, toServerFilter, whoOf, emptyFilter } from './model';

describe('journals in words', () => {
  it('says whose mail, where it goes and for how long', () => {
    expect(describeJournal(newJournal())).toBe(
      'Journal all mail to and from everyone into the built-in journal, kept 7 years.',
    );
    const finance = {
      ...newJournal(),
      direction: 'outgoing' as const,
      scope: { everyone: false, accounts: [], groups: ['b', 'c'], domains: [], tenants: ['d'] },
      retentionDays: 90,
      builtIn: false,
      archiveAddress: 'journal@archive.example',
    };
    expect(describeJournal(finance)).toBe(
      'Journal mail sent outside by people in 2 groups and 1 tenant to journal@archive.example, kept 90 days.',
    );
    const rules = { ...newJournal(), scope: { ...newJournal().scope, everyone: false } };
    expect(whoOf(rules.scope)).toBe('rules');
    expect(describeJournal(rules)).toContain('what mail flow and DLP rules send here');
  });

  it('counts years only when whole', () => {
    expect(retentionText(365)).toBe('1 year');
    expect(retentionText(3650)).toBe('10 years');
    expect(retentionText(400)).toBe('400 days');
  });

  it('says what a journal still needs', () => {
    expect(problem({ ...newJournal(), name: 'All' })).toBeNull();
    expect(problem(newJournal())).toBe('Give the journal a name.');
    expect(problem({ ...newJournal(), name: 'A', retentionDays: 29 })).toContain('between 30 and 3650');
    expect(problem({ ...newJournal(), name: 'A', builtIn: false })).toContain('archive');
    expect(problem({ ...newJournal(), name: 'A', archiveAddress: 'not an address' })).toContain('isn’t an email');
  });
});

describe('search filters', () => {
  it('sends only what was filled in, the end date whole', () => {
    expect(toServerFilter(emptyFilter())).toEqual({});
    expect(
      toServerFilter({
        ...emptyFilter(),
        address: ' bob@ ',
        direction: 'incoming',
        from: '2026-09-01',
        to: '2026-09-30',
      }),
    ).toEqual({
      address: 'bob@',
      direction: 'incoming',
      after: '2026-09-01T00:00:00Z',
      before: '2026-10-01T00:00:00Z',
    });
  });
});
