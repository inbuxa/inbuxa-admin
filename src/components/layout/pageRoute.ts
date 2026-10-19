/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** What kind of page an address is, before choosing the component that draws it. */
import { resolveObject } from '@/lib/schemaResolver';
import type { Schema } from '@/types/schema';

export type PageRoute =
  | { kind: 'none' }
  | { kind: 'dashboard'; dashboardId: string }
  /** A guided job: `Wizard/<name>[/<param>]`. */
  | { kind: 'wizard'; name: string; param?: string }
  /** One of the console's own pages: `CustomComponent/<name>`. */
  | { kind: 'custom'; name: string }
  | { kind: 'schema-loading' }
  | { kind: 'unknown' }
  | { kind: 'action' }
  | { kind: 'singleton'; objectName: string }
  | { kind: 'create' }
  | { kind: 'record'; objectName: string; permissionPrefix: string; id: string }
  | { kind: 'list' };

export function pageRoute(schema: Schema | null, viewName: string | undefined, id: string | undefined): PageRoute {
  if (!viewName) return { kind: 'none' };
  if (viewName.startsWith('Dashboard/')) return { kind: 'dashboard', dashboardId: viewName.slice('Dashboard/'.length) };
  if (viewName === 'CustomComponent/Dashboard') {
    // The dashboard link opens the schema's first dashboard.
    return { kind: 'dashboard', dashboardId: schema?.dashboards?.[0]?.id ?? 'overview' };
  }
  if (viewName.startsWith('Wizard/')) {
    const [, name, param] = viewName.split('/');
    return { kind: 'wizard', name, param };
  }
  if (viewName.startsWith('CustomComponent/'))
    return { kind: 'custom', name: viewName.slice('CustomComponent/'.length) };

  if (!schema) return { kind: 'schema-loading' };
  const resolved = resolveObject(schema, viewName);
  if (!resolved) return { kind: 'unknown' };
  if (resolved.objectName === 'x:Action') return { kind: 'action' };
  if (resolved.objectType.type === 'singleton') return { kind: 'singleton', objectName: resolved.objectName };
  if (id === 'new') return { kind: 'create' };
  if (id) return { kind: 'record', objectName: resolved.objectName, permissionPrefix: resolved.permissionPrefix, id };
  return { kind: 'list' };
}
