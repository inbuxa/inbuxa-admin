/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import {
  findFirstAccessibleLinkInLayout,
  findFirstVisibleLinkInLayout,
  isLinkAccessible,
  isLinkEnterprise,
  isLinkVisible,
  visibleLayouts,
} from './layout';
import type { Layout, Schema } from '@/types/schema';

const schema = {
  objects: {
    'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
    'x:Tenant': { type: 'object', description: '', permissionPrefix: 'sysTenant', enterprise: true },
    'x:Account': { type: 'object', description: '', permissionPrefix: 'sysAccount' },
    'x:Account/User': { type: 'view', objectName: 'x:Account' },
    'x:Tenant/Active': { type: 'view', objectName: 'x:Tenant' },
    'x:Odd/View': { type: 'view', objectName: 'x:Missing' },
  },
  schemas: {},
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [],
} as unknown as Schema;

const canGetFrom = (prefixes: string[]) => (prefix: string) => prefixes.includes(prefix);
const hasPermFrom = (perms: string[]) => (perm: string) => perms.includes(perm);
const all = () => true;
const none = () => false;

describe('isLinkVisible for schema objects', () => {
  it('needs read permission on the object, or on the object a view shows', () => {
    expect(isLinkVisible(schema, 'x:Domain', 'enterprise', canGetFrom(['sysDomain']))).toBe(true);
    expect(isLinkVisible(schema, 'x:Domain', 'enterprise', canGetFrom(['sysAccount']))).toBe(false);
    expect(isLinkVisible(schema, 'x:Account/User', 'enterprise', canGetFrom(['sysAccount']))).toBe(true);
    expect(isLinkVisible(schema, 'x:Account/User', 'enterprise', none)).toBe(false);
  });

  it('hides unknown objects, and enterprise ones on the open-source edition', () => {
    expect(isLinkVisible(schema, 'x:Nope', 'enterprise', all)).toBe(false);
    expect(isLinkVisible(schema, 'x:Odd/View', 'enterprise', all)).toBe(false);
    expect(isLinkVisible(schema, 'x:Tenant', 'oss', all)).toBe(false);
    expect(isLinkVisible(schema, 'x:Tenant', 'community', all)).toBe(true);
    expect(isLinkVisible(schema, 'x:Tenant/Active', 'oss', all)).toBe(false);
  });
});

describe('isLinkVisible for the console’s own pages', () => {
  it('shows dashboards to whoever may see live metrics and traces, never on open source', () => {
    for (const view of ['Dashboard/overview', 'CustomComponent/Dashboard']) {
      expect(isLinkVisible(schema, view, 'enterprise', canGetFrom(['sysTrace']), hasPermFrom(['liveMetrics']))).toBe(
        true,
      );
      expect(isLinkVisible(schema, view, 'enterprise', canGetFrom(['sysTrace']), hasPermFrom([]))).toBe(false);
      expect(isLinkVisible(schema, view, 'enterprise', none, hasPermFrom(['liveMetrics']))).toBe(false);
      expect(isLinkVisible(schema, view, 'oss', all, all)).toBe(false);
      expect(isLinkVisible(schema, view, 'enterprise', canGetFrom(['sysTrace']))).toBe(true);
      expect(isLinkVisible(schema, view, 'enterprise', none)).toBe(false);
    }
  });

  it('shows the live delivery test and live tracing to whoever holds their permission', () => {
    expect(isLinkVisible(schema, 'CustomComponent/LiveDelivery', 'oss', none, hasPermFrom(['liveDeliveryTest']))).toBe(
      true,
    );
    expect(isLinkVisible(schema, 'CustomComponent/LiveDelivery', 'oss', all, hasPermFrom([]))).toBe(false);
    expect(isLinkVisible(schema, 'CustomComponent/LiveTracing', 'community', none, hasPermFrom(['liveTracing']))).toBe(
      true,
    );
    expect(isLinkVisible(schema, 'CustomComponent/LiveTracing', 'community', all, hasPermFrom([]))).toBe(false);
    expect(isLinkVisible(schema, 'CustomComponent/LiveTracing', 'oss', all, all)).toBe(false);
  });

  const byReadPermission: [string, string][] = [
    ['CustomComponent/LegacyProtocols', 'sysSecurity'],
    ['CustomComponent/LocalAi', 'sysSpamLlm'],
    ['CustomComponent/AuditLog', 'sysAudit'],
    ['CustomComponent/LegalHolds', 'sysLegalHold'],
    ['CustomComponent/ComplianceOverview', 'sysCompliance'],
    ['CustomComponent/DataInventory', 'sysCompliance'],
    ['CustomComponent/DlpRules', 'sysDlpPolicy'],
    ['CustomComponent/Journal', 'sysJournal'],
    ['CustomComponent/HeldMail', 'sysDlpReview'],
    ['CustomComponent/MailFlowRules', 'sysMailRule'],
    ['CustomComponent/AccountLocks', 'sysAccountLock'],
    ['CustomComponent/SharedMailboxes', 'sysAccountLock'],
    ['CustomComponent/Deliverability', 'sysDeliverability'],
    ['CustomComponent/ScheduledReports', 'sysScheduledReport'],
    ['Wizard/dns/connect', 'sysDomain'],
  ];
  it.each(byReadPermission)('shows %s to whoever may read %s, on any edition', (view, prefix) => {
    expect(isLinkVisible(schema, view, 'oss', canGetFrom([prefix]))).toBe(true);
    expect(isLinkVisible(schema, view, 'oss', canGetFrom([]))).toBe(false);
    expect(isLinkEnterprise(schema, view)).toBe(false);
  });

  const wizards: [string, string[]][] = [
    ['Wizard/certificates', ['sysDomain', 'sysAcmeProvider', 'sysCertificate']],
    ['Wizard/sending', ['sysMtaRoute', 'sysMtaOutboundStrategy']],
    ['Wizard/directory', ['sysDirectory', 'sysDomain', 'sysAuthentication']],
    ['Wizard/limits', ['sysMtaInboundThrottle', 'sysMtaOutboundThrottle', 'sysMtaQueueQuota']],
  ];
  it.each(wizards)('opens %s to whoever may read everything it changes', (view, prefixes) => {
    expect(isLinkVisible(schema, view, 'oss', canGetFrom(prefixes))).toBe(true);
    for (const missing of prefixes) {
      expect(isLinkVisible(schema, view, 'oss', canGetFrom(prefixes.filter((p) => p !== missing)))).toBe(false);
    }
  });

  it('hides pages it doesn’t know', () => {
    expect(isLinkVisible(schema, 'CustomComponent/FromTheFuture', 'enterprise', all, all)).toBe(false);
    expect(isLinkVisible(schema, 'Wizard/unknown', 'enterprise', all, all)).toBe(false);
  });
});

describe('isLinkEnterprise and isLinkAccessible', () => {
  it('marks enterprise pages, including views of enterprise objects', () => {
    expect(isLinkEnterprise(schema, 'x:Tenant')).toBe(true);
    expect(isLinkEnterprise(schema, 'x:Tenant/Active')).toBe(true);
    expect(isLinkEnterprise(schema, 'x:Domain')).toBe(false);
    expect(isLinkEnterprise(schema, 'x:Account/User')).toBe(false);
    expect(isLinkEnterprise(schema, 'x:Odd/View')).toBe(false);
    expect(isLinkEnterprise(schema, 'x:Nope')).toBe(false);
    expect(isLinkEnterprise(schema, 'Dashboard/overview')).toBe(true);
    expect(isLinkEnterprise(schema, 'CustomComponent/LiveTracing')).toBe(true);
    expect(isLinkEnterprise(schema, 'CustomComponent/LiveDelivery')).toBe(false);
    expect(isLinkEnterprise(schema, 'CustomComponent/FromTheFuture')).toBe(false);
  });

  it('shows enterprise pages to the community edition without letting it in', () => {
    expect(isLinkVisible(schema, 'x:Tenant', 'community', all)).toBe(true);
    expect(isLinkAccessible(schema, 'x:Tenant', 'community', all)).toBe(false);
    expect(isLinkAccessible(schema, 'x:Tenant', 'enterprise', all)).toBe(true);
    expect(isLinkAccessible(schema, 'x:Domain', 'community', all)).toBe(true);
    expect(isLinkAccessible(schema, 'x:Domain', 'community', none)).toBe(false);
  });
});

describe('first links and visible layouts', () => {
  const layout: Layout = {
    name: 'Management',
    icon: 'server',
    items: [
      {
        container: {
          name: 'Directory',
          icon: 'users',
          items: [
            { type: 'container', name: 'Deep', items: [{ type: 'link', name: 'Tenants', viewName: 'x:Tenant' }] },
            { type: 'link', name: 'People', viewName: 'x:Account/User' },
          ],
        },
      },
      { link: { name: 'Domains', icon: 'globe', viewName: 'x:Domain' } },
    ],
  };
  const withLayouts = { ...schema, layouts: [layout, { name: 'Empty', icon: 'x', items: [] }] } as Schema;

  it('walks containers depth first, in order', () => {
    expect(findFirstVisibleLinkInLayout(withLayouts, layout, 'community', all)).toBe('x:Tenant');
    expect(findFirstVisibleLinkInLayout(withLayouts, layout, 'oss', all)).toBe('x:Account/User');
    expect(findFirstVisibleLinkInLayout(withLayouts, layout, 'community', canGetFrom(['sysDomain']))).toBe('x:Domain');
    expect(findFirstVisibleLinkInLayout(withLayouts, layout, 'community', none)).toBeNull();
  });

  it('skips enterprise pages for the first page the community edition may open', () => {
    expect(findFirstAccessibleLinkInLayout(withLayouts, layout, 'community', all)).toBe('x:Account/User');
    expect(findFirstAccessibleLinkInLayout(withLayouts, layout, 'enterprise', all)).toBe('x:Tenant');
    expect(findFirstAccessibleLinkInLayout(withLayouts, layout, 'community', canGetFrom(['sysTenant']))).toBeNull();
  });

  it('keeps the layouts with at least one page to show', () => {
    expect(visibleLayouts(withLayouts, 'community', all).map((l) => l.name)).toEqual(['Management']);
    expect(visibleLayouts(withLayouts, 'community', none)).toEqual([]);
  });
});
