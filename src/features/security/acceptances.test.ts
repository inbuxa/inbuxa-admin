/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { sameValue, sortOut, type Acceptance } from './acceptances';
import type { Item } from './checks';

const item = (check: string, value: unknown, subject = ''): Item => ({
  check,
  severity: 'critical',
  subject,
  value,
  title: check,
  why: '',
  action: { kind: 'review', viewName: 'x:Imap' },
});

const acceptance = (check: string, value: unknown, subject = ''): Acceptance => ({
  id: `${check}-${subject}`,
  check,
  subject,
  acceptedValue: value,
  note: 'why',
  acceptedBy: 'admin',
  acceptedAt: '2026-09-29T00:00:00Z',
});

describe('acceptances (acceptance test 9)', () => {
  it('an accepted item leaves the to-do list', () => {
    const r = sortOut([item('SS-1', true)], [acceptance('SS-1', true)]);
    expect(r.todo).toEqual([]);
    expect(r.accepted.map((a) => a.item.check)).toEqual(['SS-1']);
  });

  it('comes back, marked, when the value it was accepted for changes', () => {
    const before = { rules: [], else: 'is_local_ip(remote_ip)' };
    const after = { rules: [], else: 'true' };
    const r = sortOut([item('SS-2', after)], [acceptance('SS-2', before)]);
    expect(r.accepted).toEqual([]);
    expect(r.todo[0].stale?.check).toBe('SS-2');
  });

  it('holds per subject, and compares values whatever their key order', () => {
    const r = sortOut(
      [item('SS-13', ['dkim'], 'a.example'), item('SS-13', ['dkim'], 'b.example')],
      [acceptance('SS-13', ['dkim'], 'a.example')],
    );
    expect(r.todo.map((t) => t.item.subject)).toEqual(['b.example']);
    expect(sameValue({ a: 1, b: [2, { c: 3, d: 4 }] }, { b: [2, { d: 4, c: 3 }], a: 1 })).toBe(true);
  });
});
