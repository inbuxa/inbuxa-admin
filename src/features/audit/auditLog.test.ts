/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { EMPTY_FILTER, normalize, toServerFilter } from './auditLog';
import { formatValue, targetKindLabel, targetName } from './format';

describe('toServerFilter', () => {
  it('sends nothing for an empty filter', () => {
    expect(toServerFilter(EMPTY_FILTER)).toEqual({});
  });

  it('turns local days into a half-open UTC range covering both days', () => {
    const filter = toServerFilter({ ...EMPTY_FILTER, from: '2026-09-01', to: '2026-09-02' });
    const after = new Date(filter.after!);
    const before = new Date(filter.before!);
    expect(after.getTime()).toBe(new Date(2026, 8, 1).getTime());
    expect(before.getTime()).toBe(new Date(2026, 8, 3).getTime());
    expect(filter.after).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  it('passes the other conditions through, trimmed', () => {
    expect(
      toServerFilter({
        ...EMPTY_FILTER,
        action: 'signIn',
        outcome: 'refused',
        targetKind: ' x:Domain ',
        text: '  admin  ',
      }),
    ).toEqual({ action: 'signIn', outcome: 'refused', targetKind: 'x:Domain', text: 'admin' });
  });
});

describe('normalize', () => {
  it('fills what the server leaves out', () => {
    const event = normalize({ id: 'a', action: 'signIn' });
    expect(event.changes).toEqual([]);
    expect(event.via).toBeNull();
    expect(event.reason).toBeNull();
    expect(event.outcome).toEqual({ status: 'pending' });
  });
});

describe('format', () => {
  it('names object kinds in words', () => {
    expect(targetKindLabel('x:Domain')).toBe('Domain');
    expect(targetKindLabel('x:DkimSignature')).toBe('DKIM signature');
    expect(targetKindLabel('x:BlockedIp')).toBe('Blocked IP');
    expect(targetKindLabel('inbuxa:AuditSettings')).toBe('Audit settings');
    expect(targetKindLabel('x:OAuthClient')).toBe('OAuth client');
    expect(targetKindLabel('account')).toBe('Account');
    expect(targetKindLabel('inbuxa:AuditEvent')).toBe('Audit log');
  });

  it('never names a target by a singleton id', () => {
    expect(targetName({ id: 'singleton' })).toBe('');
    expect(targetName({ id: 'b', name: 'example.com' })).toBe('example.com');
    expect(targetName({ id: 'b' })).toBe('b');
  });

  it('shows values plainly', () => {
    expect(formatValue(undefined)).toBe('—');
    expect(formatValue('text')).toBe('text');
    expect(formatValue(false)).toBe('false');
    expect(formatValue({ '@type': 'Manual' })).toBe('{"@type":"Manual"}');
  });
});
