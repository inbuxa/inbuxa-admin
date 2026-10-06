/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { LayoutSubItem, Schema } from '@/types/schema';

function subtreeHas(items: LayoutSubItem[], viewName: string): boolean {
  return items.some((it) => (it.type === 'link' ? it.viewName === viewName : subtreeHas(it.items, viewName)));
}

/** The icon of the sidebar entry a view sits under, so its page wears the same tile. */
export function iconForView(schema: Schema | null, viewName: string): string | null {
  if (!schema) return null;
  for (const layout of schema.layouts ?? []) {
    for (const item of layout.items) {
      if ('link' in item && item.link.viewName === viewName) return item.link.icon;
      if ('container' in item && subtreeHas(item.container.items, viewName)) return item.container.icon;
    }
  }
  return null;
}
