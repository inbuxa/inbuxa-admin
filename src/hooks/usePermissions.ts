/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { resolveObject } from '@/lib/schemaResolver';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

type Action = 'Get' | 'Query' | 'Create' | 'Update' | 'Destroy';

/**
 * What the admin may do with the object behind a view. A view is checked
 * against the object it shows; a singleton always exists once, so it is
 * never created or destroyed. Nothing is allowed until the schema loads.
 */
export function objectChecks(schema: Schema | null, allowed: (prefix: string, action: Action) => boolean) {
  const may = (viewName: string, action: Action) => {
    const resolved = schema && resolveObject(schema, viewName);
    if (!resolved) return false;
    if ((action === 'Create' || action === 'Destroy') && resolved.objectType.type === 'singleton') return false;
    return allowed(resolved.permissionPrefix, action);
  };
  return {
    canViewObject: (viewName: string) => may(viewName, 'Get'),
    canCreateObject: (viewName: string) => may(viewName, 'Create'),
    canUpdateObject: (viewName: string) => may(viewName, 'Update'),
    canDestroyObject: (viewName: string) => may(viewName, 'Destroy'),
  };
}

/** The signed-in admin's permissions, and the per-view checks built on them. */
export function usePermissions() {
  const { permissions, edition, hasPermission, hasObjectPermission } = useAccountStore();
  const schema = useSchemaStore((s) => s.schema);
  return { permissions, edition, hasPermission, hasObjectPermission, ...objectChecks(schema, hasObjectPermission) };
}
