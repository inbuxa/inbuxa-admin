/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SECTION_NAV_MAX_ITEMS,
  checkIsEnterprise,
  checkLinkVisible,
  fitsSectionNav,
  pathMatchesView,
  resolveViewPath,
  subtreeContainsActive,
  subtreeHasVisibleLink,
  topItemKey,
  topItemVisible,
  visibleLinks,
} from './navTree';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Layout, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';

describe('pathMatchesView', () => {
  beforeEach(() => {
    useSchemaStore.setState({
      schema: {
        objects: {
          'x:Metrics': { type: 'singleton' },
          'x:Metrics/CollectorPrometheus': { type: 'view', objectName: 'x:Metrics' },
          'x:Domain': { type: 'object' },
        },
      } as unknown as Schema,
    });
  });

  it('matches the page and its records', () => {
    expect(pathMatchesView('/Settings/x:Metrics', 'Settings', 'x:Metrics')).toBe(true);
    expect(pathMatchesView('/Management/x:Domain/b', 'Management', 'x:Domain')).toBe(true);
    expect(pathMatchesView('/Management/x:Domain/new', 'Management', 'x:Domain')).toBe(true);
  });

  it('does not match a separate page under it', () => {
    const path = '/Settings/x:Metrics/CollectorPrometheus';
    expect(pathMatchesView(path, 'Settings', 'x:Metrics')).toBe(false);
    expect(pathMatchesView(path, 'Settings', 'x:Metrics/CollectorPrometheus')).toBe(true);
  });
});

describe('walking the menu tree', () => {
  const objects = {
    'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
    'x:Tenant': { type: 'object', description: '', permissionPrefix: 'sysTenant', enterprise: true },
    'x:Account': { type: 'object', description: '', permissionPrefix: 'sysAccount' },
  };
  const tree: LayoutSubItem[] = [
    { type: 'link', name: '', viewName: 'x:Domain' },
    {
      type: 'container',
      name: 'Deeper',
      items: [
        { type: 'link', name: 'Tenants', viewName: 'x:Tenant' },
        { type: 'link', name: 'People', viewName: 'x:Account' },
      ],
    },
    { type: 'container', name: 'Empty', items: [] },
  ];
  const as = (edition: 'oss' | 'community' | 'enterprise', permissions: string[]) => {
    useSchemaStore.setState({ schema: { objects, layouts: [] } as unknown as Schema });
    useAccountStore.setState({ edition, permissions });
  };

  it('finds the active page anywhere under a container', () => {
    as('enterprise', []);
    expect(subtreeContainsActive(tree, '/Management/x:Account/b', 'Management')).toBe(true);
    expect(subtreeContainsActive(tree, '/Management/x:Domain', 'Management')).toBe(true);
    expect(subtreeContainsActive(tree, '/Settings/x:Domain', 'Management')).toBe(false);
    expect(subtreeContainsActive(tree, '/Management/x:Other', 'Management')).toBe(false);
  });

  it('marks the dashboard link active on every dashboard', () => {
    as('enterprise', []);
    expect(pathMatchesView('/Management/Dashboard/delivery', 'Management', 'CustomComponent/Dashboard')).toBe(true);
    expect(pathMatchesView('/Settings/Dashboard/delivery', 'Management', 'CustomComponent/Dashboard')).toBe(false);
    expect(resolveViewPath('Management', 'x:Domain')).toBe('/Management/x:Domain');
  });

  it('sees links by permission, and hides enterprise ones on open source', () => {
    as('enterprise', ['sysTenantGet']);
    expect(subtreeHasVisibleLink(tree, 'enterprise')).toBe(true);
    expect(checkLinkVisible('x:Tenant')).toBe(true);
    expect(checkLinkVisible('x:Domain')).toBe(false);
    expect(checkIsEnterprise('x:Tenant')).toBe(true);
    as('oss', ['sysTenantGet']);
    expect(subtreeHasVisibleLink(tree, 'oss')).toBe(false);
    as('community', []);
    expect(subtreeHasVisibleLink(tree, 'community')).toBe(false);
  });

  it('flattens the visible links, naming deeper ones after their group', () => {
    as('community', ['sysDomainGet', 'sysTenantGet', 'sysAccountGet']);
    expect(visibleLinks(tree, 'community')).toEqual([
      { name: 'Overview', viewName: 'x:Domain' },
      { name: 'Deeper › Tenants', viewName: 'x:Tenant' },
      { name: 'Deeper › People', viewName: 'x:Account' },
    ]);
    as('oss', ['sysDomainGet', 'sysTenantGet', 'sysAccountGet']);
    expect(visibleLinks(tree, 'oss').map((l) => l.viewName)).toEqual(['x:Domain', 'x:Account']);
  });

  it('decides which top-level entries show, and whether a layout fits a menu bar', () => {
    as('oss', ['sysTenantGet', 'sysAccountGet']);
    const link: LayoutItem = { link: { name: 'Tenants', icon: 't', viewName: 'x:Tenant' } };
    const group: LayoutItem = { container: { name: 'Group', icon: 'g', items: tree } };
    expect(topItemVisible(link, 'oss')).toBe(false);
    expect(topItemVisible(group, 'oss')).toBe(true);
    expect(topItemKey(link)).toBe('x:Tenant');
    expect(topItemKey(group)).toBe('Group');
    const many = (n: number): Layout => ({ name: 'L', icon: 'l', items: Array.from({ length: n }, () => group) });
    expect(fitsSectionNav(many(SECTION_NAV_MAX_ITEMS), 'oss')).toBe(true);
    expect(fitsSectionNav(many(SECTION_NAV_MAX_ITEMS + 1), 'oss')).toBe(false);
    expect(fitsSectionNav({ ...many(SECTION_NAV_MAX_ITEMS + 1), items: [...many(12).items, link] }, 'oss')).toBe(true);
  });

  it('treats every link as visible before the schema loads', () => {
    useSchemaStore.setState({ schema: null });
    expect(checkLinkVisible('x:Anything')).toBe(true);
    expect(checkIsEnterprise('x:Anything')).toBe(false);
  });
});
