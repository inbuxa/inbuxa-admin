/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Searching the schema's pages, sections and fields, and where a result leads. */
import { List, Plus, Settings } from 'lucide-react';
import { resolveObject } from '@/lib/schemaResolver';
import type { SearchIndexEntry } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

export const MAX_RESULTS = 15;

/** Pages first, then form sections, then fields. */
const TYPE_ORDER: Record<SearchIndexEntry['type'], number> = { link: 0, form: 1, field: 2 };

export type ObjectKind = 'singleton' | 'object' | null;

export function getObjectKind(schema: Schema, viewName: string): ObjectKind {
  const resolved = resolveObject(schema, viewName);
  if (!resolved) return null;
  return resolved.objectType.type === 'singleton' ? 'singleton' : 'object';
}

/** What choosing a result does: open settings, open a list, or create a record. */
export function getActionInfo(
  entryType: SearchIndexEntry['type'],
  objectKind: ObjectKind,
  t: (key: string, fallback: string) => string,
): { label: string; Icon: typeof List } {
  if (objectKind === 'singleton') return { label: t('globalSearch.settings', 'Settings'), Icon: Settings };
  return entryType === 'link'
    ? { label: t('globalSearch.list', 'List'), Icon: List }
    : { label: t('globalSearch.create', 'Create'), Icon: Plus };
}

/** Where a result leads: settings open as the singleton, pages as their list, sections and fields as a new record. */
export function entryPath(entry: SearchIndexEntry, objectKind: ObjectKind): string {
  const page = `/${entry.section}/${entry.viewName}`;
  if (objectKind === 'singleton') return `${page}/singleton`;
  return entry.type === 'link' ? page : `${page}/new`;
}

/** A view name without the `x:` prefix or its parents: `x:Account/User` is `User`. */
export function friendlyName(viewName: string): string {
  return viewName.replace(/^x:/, '').split('/').pop() ?? '';
}

/**
 * The entries holding every word of the query, in their text or keywords,
 * that the account may read; pages first, at most fifteen.
 */
export function searchEntries(
  index: SearchIndexEntry[],
  query: string,
  schema: Schema | null,
  canGet: (permissionPrefix: string) => boolean,
): SearchIndexEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0 || !schema) return [];
  return index
    .filter((entry) => {
      const text = `${entry.text} ${entry.keywords?.join(' ') ?? ''}`.toLowerCase();
      if (!words.every((word) => text.includes(word))) return false;
      const resolved = resolveObject(schema, entry.viewName);
      return resolved !== null && canGet(resolved.permissionPrefix);
    })
    .sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type])
    .slice(0, MAX_RESULTS);
}

/** Results by kind, in the order the kinds first appear. */
export function groupByType(entries: SearchIndexEntry[]): Map<SearchIndexEntry['type'], SearchIndexEntry[]> {
  const groups = new Map<SearchIndexEntry['type'], SearchIndexEntry[]>();
  for (const entry of entries) groups.set(entry.type, [...(groups.get(entry.type) ?? []), entry]);
  return groups;
}
