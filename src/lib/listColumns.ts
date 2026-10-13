/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: columns a served list leaves out. The Directories list shows only
 * each directory's type, so two LDAP directories look the same until you
 * open them (admin #108).
 */

import type { Column, Schema } from '@/types/schema';

const EXTRA_COLUMNS: Record<string, Column[]> = {
  'x:Directory': [{ name: 'description', label: 'Description' }],
};

/** The schema with the extra columns added after the served ones; applied once, when the schema loads. */
export function withExtraColumns(schema: Schema): Schema {
  let lists = schema.lists;
  for (const [viewName, extra] of Object.entries(EXTRA_COLUMNS)) {
    const list = lists[viewName];
    if (!list) continue;
    const missing = extra.filter((c) => !list.columns.some((have) => have.name === c.name));
    if (missing.length === 0) continue;
    lists = { ...lists, [viewName]: { ...list, columns: [...list.columns, ...missing] } };
  }
  return lists === schema.lists ? schema : { ...schema, lists };
}
