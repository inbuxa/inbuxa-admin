/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, it, expect, vi } from 'vitest';
import type { TFunction } from 'i18next';
import { adminPageTitle, landing, parseAdminPath, permissionChecks, readSessionInfo } from './adminRoute';
import type { Schema } from '@/types/schema';
import type { SearchIndexEntry } from '@/stores/schemaStore';

const t = ((_key: string, fallback: string, vars?: Record<string, string>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars?.[k] ?? '')) as unknown as TFunction;

const objects = {
  'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
  'x:Account': { type: 'object', description: '', permissionPrefix: 'sysAccount' },
  'x:Account/User': { type: 'view', objectName: 'x:Account' },
  'x:Tenant': { type: 'object', description: '', permissionPrefix: 'sysTenant', enterprise: true },
  'x:MtaStageEhlo': { type: 'singleton', description: '', permissionPrefix: 'sysMtaStageEhlo' },
} as unknown as Schema['objects'];

describe('parseAdminPath', () => {
  it('reads nothing without a path', () => {
    expect(parseAdminPath(undefined, objects)).toEqual({});
    expect(parseAdminPath('', objects)).toEqual({});
  });

  it('takes new and singleton as the record', () => {
    expect(parseAdminPath('x:Domain/new', objects)).toEqual({ viewName: 'x:Domain', id: 'new' });
    expect(parseAdminPath('x:Account/User/new', objects)).toEqual({ viewName: 'x:Account/User', id: 'new' });
    expect(parseAdminPath('x:MtaStageEhlo/singleton', objects)).toEqual({
      viewName: 'x:MtaStageEhlo',
      id: 'singleton',
    });
  });

  it('prefers a known view over a record id', () => {
    expect(parseAdminPath('x:Account/User', objects)).toEqual({ viewName: 'x:Account/User' });
    expect(parseAdminPath('x:Domain', objects)).toEqual({ viewName: 'x:Domain' });
  });

  it('splits off a record id after a known view', () => {
    expect(parseAdminPath('x:Domain/b', objects)).toEqual({ viewName: 'x:Domain', id: 'b' });
    expect(parseAdminPath('x:Account/User/b', objects)).toEqual({ viewName: 'x:Account/User', id: 'b' });
  });

  it('keeps an unknown path whole, as for the console’s own pages', () => {
    expect(parseAdminPath('Dashboard/overview', objects)).toEqual({ viewName: 'Dashboard/overview' });
    expect(parseAdminPath('Wizard/dns/b', objects)).toEqual({ viewName: 'Wizard/dns/b' });
    expect(parseAdminPath('x:Domain/b', undefined)).toEqual({ viewName: 'x:Domain/b' });
  });
});

describe('adminPageTitle', () => {
  const searchIndex = [
    { text: 'Domains (elsewhere)', type: 'link', viewName: 'x:Domain', section: 'Settings', breadcrumb: '' },
    { text: 'Domain name', type: 'field', viewName: 'x:Domain', section: 'Management', breadcrumb: '' },
    { text: 'Domains', type: 'link', viewName: 'x:Domain', section: 'Management', breadcrumb: '' },
    { text: 'People', type: 'link', viewName: 'x:Account/User', section: 'Management', breadcrumb: '' },
  ] as SearchIndexEntry[];
  const dashboards = [{ id: 'delivery', label: 'Delivery' }] as Schema['dashboards'];
  const title = (section?: string, viewName?: string, id?: string) =>
    adminPageTitle(t, { section, viewName, id, searchIndex, dashboards });

  it('falls back to the section, then to Dashboard', () => {
    expect(title()).toBe('Dashboard');
    expect(title('Management')).toBe('Management');
  });

  it('names a page after its link in this section, else any section, else its view name', () => {
    expect(title('Management', 'x:Domain')).toBe('Domains · Management');
    expect(title('Account', 'x:Domain')).toBe('Domains (elsewhere) · Account');
    expect(title('Management', 'x:Domain', 'b')).toBe('Domains · Management');
    expect(title('Management', 'x:Domain', 'new')).toBe('Create Domains · Management');
    expect(title('Management', 'x:Mystery')).toMatch(/ · Management$/);
  });

  it('names the guided jobs', () => {
    expect(title('Management', 'Wizard/dns/b')).toBe('Publish DNS · Management');
    expect(title('Settings', 'Wizard/limits')).toBe('Limits · Settings');
    expect(title('Settings', 'Wizard/directory')).toBe('Sign-in directory · Settings');
    expect(title('Settings', 'Wizard/certificates')).toBe('Certificates · Settings');
    expect(title('Settings', 'Wizard/sending')).toBe('Sending mail · Settings');
  });

  it('names the dashboards', () => {
    expect(title('Management', 'Dashboard/overview')).toBe('Command center');
    expect(title('Management', 'Dashboard/cluster')).toBe('Cluster · Dashboard');
    expect(title('Management', 'Dashboard/delivery')).toBe('Delivery · Dashboard');
    expect(title('Management', 'Dashboard/gone')).toBe('Dashboard · Dashboard');
  });
});

describe('readSessionInfo', () => {
  it('keeps the accounts, the primary account, the API address and the limits', () => {
    const info = readSessionInfo({
      accounts: { a: { name: 'admin', isPersonal: true, extra: 1 }, b: { name: 'shared', isPersonal: false } },
      primaryAccounts: { 'urn:ietf:params:jmap:mail': 'b', 'urn:ietf:params:jmap:core': 'a' },
      apiUrl: '/jmap/',
      capabilities: { 'urn:ietf:params:jmap:core': { maxObjectsInGet: 500, maxObjectsInSet: '9' } },
    });
    expect(info).toEqual({
      accounts: { a: { name: 'admin', isPersonal: true }, b: { name: 'shared', isPersonal: false } },
      primaryAccountId: 'a',
      apiUrl: '/jmap/',
      maxObjectsInGet: 500,
      maxObjectsInSet: undefined,
    });
  });

  it('falls back to any primary account, then the first account, and /jmap', () => {
    const accounts = { z: { name: 'z', isPersonal: true } };
    expect(readSessionInfo({ accounts, primaryAccounts: { mail: 'y' } }).primaryAccountId).toBe('y');
    expect(readSessionInfo({ accounts, primaryAccounts: {} })).toMatchObject({
      primaryAccountId: 'z',
      apiUrl: '/jmap',
    });
  });
});

describe('permissionChecks', () => {
  it('reads Get permissions by prefix, and others by name', () => {
    const { canGet, hasPerm } = permissionChecks(['sysDomainGet', 'liveTracing']);
    expect(canGet('sysDomain')).toBe(true);
    expect(canGet('sysAccount')).toBe(false);
    expect(hasPerm('liveTracing')).toBe(true);
    expect(hasPerm('sysDomainGet')).toBe(true);
  });
});

describe('landing', () => {
  const schema = {
    objects,
    layouts: [
      {
        name: 'Management',
        icon: 'server',
        items: [
          { link: { name: 'Tenants', icon: 't', viewName: 'x:Tenant' } },
          { link: { name: 'People', icon: 'p', viewName: 'x:Account/User' } },
          { link: { name: 'Domains', icon: 'g', viewName: 'x:Domain' } },
        ],
      },
      {
        name: 'Settings',
        icon: 's',
        items: [{ link: { name: 'EHLO', icon: 'e', viewName: 'x:MtaStageEhlo' } }],
      },
    ],
  } as unknown as Schema;
  const everything = ['sysDomainGet', 'sysAccountGet', 'sysTenantGet', 'sysMtaStageEhloGet'];

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });

  it('opens the first page that can be opened when no section is given', () => {
    expect(landing(schema, 'community', everything, undefined, undefined)).toEqual({
      kind: 'redirect',
      section: 'Management',
      link: 'x:Account/User',
    });
    expect(landing(schema, 'enterprise', everything, undefined, undefined)).toMatchObject({ link: 'x:Tenant' });
  });

  it('falls back to a visible page, then to nothing', () => {
    expect(landing(schema, 'community', ['sysTenantGet'], undefined, undefined)).toEqual({
      kind: 'redirect',
      section: 'Management',
      link: 'x:Tenant',
    });
    expect(landing(schema, 'community', [], undefined, undefined)).toBeNull();
  });

  it('stays on a page that can be opened, naming its section as the layout spells it', () => {
    expect(landing(schema, 'enterprise', everything, 'management', 'x:Domain')).toEqual({
      kind: 'stay',
      section: 'Management',
      remember: { section: 'Management', viewName: 'x:Domain' },
    });
  });

  it('stays without remembering when the section is not one of the account’s', () => {
    expect(landing(schema, 'enterprise', ['sysDomainGet'], 'Settings', 'x:Domain')).toEqual({
      kind: 'stay',
      section: 'Management',
      remember: null,
    });
  });

  it('sends a page that cannot be opened to the first one that can', () => {
    expect(landing(schema, 'community', everything, 'Settings', 'x:Tenant')).toEqual({
      kind: 'redirect',
      section: 'Management',
      link: 'x:Account/User',
    });
    expect(landing(schema, 'community', everything, 'Management', 'x:Nope')).toMatchObject({ link: 'x:Account/User' });
  });

  it('stays when that first page is the one asked for', () => {
    expect(landing(schema, 'community', ['sysTenantGet'], 'Management', 'x:Tenant')).toEqual({
      kind: 'stay',
      section: 'Management',
      remember: { section: 'Management', viewName: 'x:Tenant' },
    });
  });

  it('opens a section where it was last left, else on its first page', () => {
    expect(landing(schema, 'enterprise', everything, 'settings', undefined)).toEqual({
      kind: 'redirect',
      section: 'Settings',
      link: 'x:MtaStageEhlo',
    });
    localStorage.setItem('inbuxa-last-visited', JSON.stringify({ Management: 'x:Domain' }));
    expect(landing(schema, 'enterprise', everything, 'Management', undefined)).toMatchObject({ link: 'x:Domain' });
  });

  it('opens the first section when the one asked for is not the account’s', () => {
    expect(landing(schema, 'enterprise', ['sysDomainGet'], 'Settings', undefined)).toEqual({
      kind: 'redirect',
      section: 'Management',
      link: 'x:Domain',
    });
  });
});
