/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { pageRoute } from './pageRoute';
import type { Schema } from '@/types/schema';

const schema = {
  objects: {
    'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
    'x:Account': { type: 'object', description: '', permissionPrefix: 'sysAccount' },
    'x:Account/User': { type: 'view', objectName: 'x:Account' },
    'x:Security': { type: 'singleton', description: '', permissionPrefix: 'sysSecurity' },
    'x:Action': { type: 'object', description: '', permissionPrefix: 'sysAction' },
    'x:Action/Server': { type: 'view', objectName: 'x:Action' },
  },
  dashboards: [{ id: 'delivery', label: 'Delivery' }],
} as unknown as Schema;

describe('pageRoute', () => {
  it('has nothing to show without a view', () => {
    expect(pageRoute(schema, undefined, undefined)).toEqual({ kind: 'none' });
  });

  it('reads dashboards, the dashboard link opening the first one', () => {
    expect(pageRoute(schema, 'Dashboard/overview', undefined)).toEqual({ kind: 'dashboard', dashboardId: 'overview' });
    expect(pageRoute(schema, 'CustomComponent/Dashboard', undefined)).toEqual({
      kind: 'dashboard',
      dashboardId: 'delivery',
    });
    expect(pageRoute(null, 'CustomComponent/Dashboard', undefined)).toEqual({
      kind: 'dashboard',
      dashboardId: 'overview',
    });
  });

  it('reads guided jobs and the console’s own pages, schema or not', () => {
    expect(pageRoute(null, 'Wizard/dns/b', undefined)).toEqual({ kind: 'wizard', name: 'dns', param: 'b' });
    expect(pageRoute(null, 'Wizard/limits', undefined)).toEqual({ kind: 'wizard', name: 'limits', param: undefined });
    expect(pageRoute(null, 'CustomComponent/AuditLog', undefined)).toEqual({ kind: 'custom', name: 'AuditLog' });
  });

  it('waits for the schema for anything else, and knows when a view is unknown', () => {
    expect(pageRoute(null, 'x:Domain', undefined)).toEqual({ kind: 'schema-loading' });
    expect(pageRoute(schema, 'x:Nope', undefined)).toEqual({ kind: 'unknown' });
  });

  it('tells actions, singletons, new records, records and lists apart', () => {
    expect(pageRoute(schema, 'x:Action/Server', undefined)).toEqual({ kind: 'action' });
    expect(pageRoute(schema, 'x:Action/Server', 'b')).toEqual({ kind: 'action' });
    expect(pageRoute(schema, 'x:Security', 'singleton')).toEqual({ kind: 'singleton', objectName: 'x:Security' });
    expect(pageRoute(schema, 'x:Security', undefined)).toEqual({ kind: 'singleton', objectName: 'x:Security' });
    expect(pageRoute(schema, 'x:Domain', 'new')).toEqual({ kind: 'create' });
    expect(pageRoute(schema, 'x:Account/User', 'b')).toEqual({
      kind: 'record',
      objectName: 'x:Account',
      permissionPrefix: 'sysAccount',
      id: 'b',
    });
    expect(pageRoute(schema, 'x:Domain', undefined)).toEqual({ kind: 'list' });
  });
});
