/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Each section (Management, Settings, Account) opens on the page the admin
 * last used in it, kept in this browser. A remembered page the admin can no
 * longer open is skipped.
 */
import {
  findFirstAccessibleLinkInLayout,
  findFirstVisibleLinkInLayout,
  isLinkAccessible,
  type CanGet,
  type HasPermission,
} from '@/lib/layout';
import type { Layout, Schema } from '@/types/schema';

const KEY = 'inbuxa-last-visited';

/** Section name → view name; empty when storage is missing, blocked or garbled. */
function remembered(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? { ...value } : {};
  } catch {
    return {};
  }
}

export function rememberLastVisited(section: string, viewName: string): void {
  const all = remembered();
  if (all[section] === viewName) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...all, [section]: viewName }));
  } catch {
    // Storage full or blocked: the section opens on its first page instead.
  }
}

/** Where a section opens: the page last used there, else its first page the admin may open, else its first page. */
export function sectionLandingLink(
  schema: Schema,
  layout: Layout,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  const last = remembered()[layout.name];
  if (typeof last === 'string' && isLinkAccessible(schema, last, edition, canGet, hasPerm)) return last;
  return (
    findFirstAccessibleLinkInLayout(schema, layout, edition, canGet, hasPerm) ??
    findFirstVisibleLinkInLayout(schema, layout, edition, canGet, hasPerm)
  );
}
