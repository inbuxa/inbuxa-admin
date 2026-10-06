/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { delegateProblem, maxDelegates, untilFromServer, untilToServer, type Delegate } from './accountLock';

const d = (patch: Partial<Delegate>): Delegate => ({
  accountId: 'b',
  access: 'read',
  sendAs: false,
  until: '',
  ...patch,
});

describe('delegateProblem', () => {
  it('accepts a plain list', () => {
    expect(delegateProblem([d({}), d({ accountId: 'c', access: 'full', sendAs: true })], 'z')).toBeNull();
  });

  it('refuses what the server would', () => {
    expect(delegateProblem([d({ accountId: '' })], 'z')).toMatch(/Choose/);
    expect(delegateProblem([d({ accountId: 'z' })], 'z')).toMatch(/own delegate/);
    expect(delegateProblem([d({}), d({})], 'z')).toMatch(/twice/);
    expect(delegateProblem([d({ sendAs: true })], 'z')).toMatch(/organize or full/);
    expect(
      delegateProblem(
        Array.from({ length: 11 }, (_, i) => d({ accountId: `a${i}` })),
        'z',
      ),
    ).toMatch(/At most/);
  });
});

describe('until', () => {
  it('means the end of the chosen local day', () => {
    const iso = untilToServer('2026-10-01')!;
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(new Date(iso).getTime()).toBe(new Date(2026, 9, 1, 23, 59, 59).getTime());
    expect(untilFromServer(iso)).toBe('2026-10-01');
  });

  it('is empty for no end', () => {
    expect(untilToServer('')).toBeNull();
    expect(untilFromServer(null)).toBe('');
    expect(untilFromServer('not a date')).toBe('');
  });
});

describe('shared mailboxes (MA-S)', () => {
  it('hold up to 100 people, where a lock holds 10', () => {
    const people = (n: number) => Array.from({ length: n }, (_, i) => d({ accountId: `a${i}` }));
    expect(maxDelegates('lock')).toBe(10);
    expect(maxDelegates('sharedMailbox')).toBe(100);
    expect(delegateProblem(people(11), 'z')).toMatch(/At most 10/);
    expect(delegateProblem(people(11), 'z', 'sharedMailbox')).toBeNull();
    expect(delegateProblem(people(101), 'z', 'sharedMailbox')).toMatch(/At most 100 people/);
    expect(delegateProblem([d({ accountId: '' })], 'z', 'sharedMailbox')).toMatch(/each person/);
  });
});
