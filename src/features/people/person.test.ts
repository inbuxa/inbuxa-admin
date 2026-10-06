/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { hueOf, initialsOf, personOf } from './person';

describe('initialsOf', () => {
  it('takes first and last name, or the start of one name or the address', () => {
    expect(initialsOf('Ada King Lovelace', 'ada@example.org')).toBe('AL');
    expect(initialsOf('Cher', 'cher@example.org')).toBe('CH');
    expect(initialsOf(undefined, 'j.doe@example.org')).toBe('JD');
    expect(initialsOf('   ', 'émile@example.org')).toBe('ÉM');
    expect(initialsOf(undefined, '@')).toBe('?');
  });
});

describe('hueOf', () => {
  it('is the same for the same address, whatever its case, and in range', () => {
    expect(hueOf('Ada@Example.org')).toBe(hueOf('ada@example.org'));
    const h = hueOf('someone@example.org');
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
  });
});

describe('personOf', () => {
  it('reads a People row', () => {
    const p = personOf({
      id: 'a',
      emailAddress: 'ada@example.org',
      description: 'Ada Lovelace',
      usedDiskQuota: 750,
      quotas: { maxDiskQuota: 1000 },
      roles: { '@type': 'Admin' },
      memberGroupIds: { g1: true, g2: true },
      createdAt: '2026-03-01T00:00:00Z',
    });
    expect(p).toMatchObject({
      name: 'Ada Lovelace',
      address: 'ada@example.org',
      initials: 'AL',
      used: 750,
      quota: 1000,
      fill: 0.75,
      role: 'admin',
      groups: 2,
    });
  });

  it('has no fill without a limit, and is a plain user without a role', () => {
    const p = personOf({ id: 'b', emailAddress: 'bo@example.org', usedDiskQuota: 5, quotas: { maxDiskQuota: 0 } });
    expect(p).toMatchObject({ quota: null, fill: null, role: 'user', groups: 0, name: undefined, initials: 'BO' });
  });

  it('caps the fill at full', () => {
    expect(personOf({ id: 'c', emailAddress: 'c@x', usedDiskQuota: 20, quotas: { maxDiskQuota: 10 } }).fill).toBe(1);
  });
});
