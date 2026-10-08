/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cardOf, countOf } from './objectCard';
import { cardKindOf, cardPropertiesFor, readListLayout, writeListLayout } from './layout';

describe('countOf', () => {
  it('counts a set or object list in either wire shape', () => {
    expect(countOf(['a', 'b'])).toBe(2);
    expect(countOf({ 'a@example.org': true, 'b@example.org': true, 'c@example.org': true })).toBe(3);
    expect(countOf({ 0: { name: 'x' } })).toBe(1);
    expect(countOf(undefined)).toBe(0);
    expect(countOf('nope')).toBe(0);
  });
});

describe('cardOf', () => {
  it('names a mailing list by its description, with the address under it', () => {
    const c = cardOf('mailingList', {
      id: 'l1',
      emailAddress: 'team@example.org',
      description: 'The whole team',
      recipients: { 'a@example.org': true, 'b@example.org': true },
    });
    expect(c).toMatchObject({ title: 'The whole team', address: 'team@example.org', recipients: 2, aliases: 0 });
  });

  it('shows a mailing list with no description by its address, once', () => {
    const c = cardOf('mailingList', { id: 'l1', emailAddress: 'team@example.org' });
    expect(c).toMatchObject({ title: 'team@example.org', address: undefined });
  });

  it('reads a tenant’s storage against its limit', () => {
    const c = cardOf('tenant', { id: 't1', name: 'Acme', usedDiskQuota: 50, quotas: { maxDiskQuota: 200 } });
    expect(c).toMatchObject({ title: 'Acme', initials: 'AC', used: 50, quota: 200, fill: 0.25 });
    expect(cardOf('tenant', { id: 't2', name: 'Open', quotas: { maxDiskQuota: 0 } })).toMatchObject({
      quota: null,
      fill: null,
    });
  });

  it('counts a role’s permissions', () => {
    const c = cardOf('role', {
      id: 'r1',
      description: 'Help desk',
      enabledPermissions: { sysAccountGet: true, sysAccountUpdate: true },
      disabledPermissions: { sysAccountDestroy: true },
      roleIds: {},
    });
    expect(c).toMatchObject({ title: 'Help desk', granted: 2, removed: 1, includes: 0 });
  });

  it('falls back to an OAuth client’s id for its name', () => {
    expect(
      cardOf('oauthClient', { id: 'o1', clientId: 'thunderbird', redirectUris: ['http://localhost'] }),
    ).toMatchObject({ title: 'thunderbird', clientId: 'thunderbird', redirects: 1, expired: false });
  });

  it('marks an OAuth client whose registration has run out', () => {
    const now = Date.parse('2026-10-07T00:00:00Z');
    expect(cardOf('oauthClient', { id: 'o1', clientId: 'x', expiresAt: '2026-10-01T00:00:00Z' }, now)).toMatchObject({
      expired: true,
    });
    expect(cardOf('oauthClient', { id: 'o1', clientId: 'x', expiresAt: '2027-01-01T00:00:00Z' }, now)).toMatchObject({
      expired: false,
    });
  });

  it('reads which parts of a domain run themselves', () => {
    const c = cardOf('domain', {
      id: 'd1',
      name: 'example.org',
      isEnabled: false,
      dnsManagement: { '@type': 'Automatic' },
      dkimManagement: { '@type': 'Manual' },
      aliases: ['example.net'],
    });
    expect(c).toMatchObject({ title: 'example.org', enabled: false, dns: true, dkim: false, certs: false, aliases: 1 });
  });
});

describe('layout', () => {
  // In memory: Node's own `localStorage` global, empty without a storage file, hides happy-dom's.
  beforeAll(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      clear: () => store.clear(),
    });
  });
  afterEach(() => localStorage.clear());

  it('offers cards on Directory and Domains lists, not elsewhere', () => {
    expect(cardKindOf('x:Account/Group')).toBe('group');
    expect(cardKindOf('x:Domain')).toBe('domain');
    expect(cardKindOf('x:DkimSignature')).toBeUndefined();
    expect(cardPropertiesFor('x:Account/Group')).not.toContain('memberGroupIds');
    expect(cardPropertiesFor('x:Log')).toEqual([]);
  });

  it('defaults to cards and remembers a choice per list', () => {
    expect(readListLayout('x:Domain')).toBe('cards');
    writeListLayout('x:Domain', 'table');
    expect(readListLayout('x:Domain')).toBe('table');
    expect(readListLayout('x:Tenant')).toBe('cards');
  });

  it('keeps the choice People made before every list had one', () => {
    localStorage.setItem('inbuxa-people-layout', 'table');
    expect(readListLayout('x:Account/User')).toBe('table');
    expect(readListLayout('x:Account/Group')).toBe('cards');
  });
});
