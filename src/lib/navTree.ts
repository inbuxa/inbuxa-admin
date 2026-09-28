/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

/**
 * INBUXA: walking the server's menu tree, shared by the two shells that draw it
 * — the sidebar (legacy) and the section bar (modern). The tree itself is the
 * schema's `layouts`, so neither shell may assume a depth or a fan-out.
 */

import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { isLinkEnterprise, isLinkVisible } from '@/lib/layout';
import type { Layout, LayoutItem, LayoutSubItem } from '@/types/schema';

/**
 * Past this many top-level entries a layout is a configuration browser rather
 * than a set of destinations, and a menu bar stops helping however wide the
 * window: on the stock schema that is Settings, with its nineteen groups, which
 * keeps the sidebar under either shell. Management (nine) and Account (eleven)
 * fit, and anything left over folds into the section bar's "More".
 */
export const SECTION_NAV_MAX_ITEMS = 12;

export function resolveViewPath(sectionName: string, viewName: string): string {
  return `/${sectionName}/${viewName}`;
}

export function pathMatchesView(currentPath: string, sectionName: string, viewName: string): boolean {
  const base = `/${sectionName}/${viewName}`;
  if (currentPath === base) return true;
  if (currentPath.startsWith(`${base}/`)) {
    // inbuxa: /Settings/x:Metrics/CollectorPrometheus is its own page, not a record of
    // x:Metrics, so General and Prometheus aren't both highlighted.
    const next = decodeURIComponent(currentPath.slice(base.length + 1).split('/')[0]);
    return !useSchemaStore.getState().schema?.objects[`${viewName}/${next}`];
  }
  if (viewName === 'CustomComponent/Dashboard') {
    const dashBase = `/${sectionName}/Dashboard/`;
    return currentPath.startsWith(dashBase);
  }
  return false;
}

export function checkLinkVisible(viewName: string): boolean {
  const schema = useSchemaStore.getState().schema;
  if (!schema) return true;

  const accountStore = useAccountStore.getState();
  return isLinkVisible(
    schema,
    viewName,
    accountStore.edition,
    (prefix: string) => accountStore.hasObjectPermission(prefix, 'Get'),
    (perm: string) => accountStore.hasPermission(perm),
  );
}

export function checkIsEnterprise(viewName: string): boolean {
  const schema = useSchemaStore.getState().schema;
  if (!schema) return false;
  const edition = useAccountStore.getState().edition;
  return isLinkEnterprise(schema, viewName, edition);
}

export function subtreeContainsActive(items: LayoutSubItem[], currentPath: string, sectionName: string): boolean {
  for (const item of items) {
    if (item.type === 'link') {
      if (pathMatchesView(currentPath, sectionName, item.viewName)) return true;
    } else if (item.type === 'container') {
      if (subtreeContainsActive(item.items, currentPath, sectionName)) return true;
    }
  }
  return false;
}

export function subtreeHasVisibleLink(items: LayoutSubItem[], edition: string): boolean {
  for (const item of items) {
    if (item.type === 'link') {
      if (!checkLinkVisible(item.viewName)) continue;
      const enterprise = checkIsEnterprise(item.viewName);
      if (enterprise && edition === 'oss') continue;
      return true;
    } else if (item.type === 'container') {
      if (subtreeHasVisibleLink(item.items, edition)) return true;
    }
  }
  return false;
}

/** Every visible link under a container, flattened, deeper names prefixed with their group. */
export function visibleLinks(
  items: LayoutSubItem[],
  edition: string,
  prefix = '',
): { name: string; viewName: string }[] {
  const out: { name: string; viewName: string }[] = [];
  for (const it of items) {
    if (it.type === 'link') {
      if (!checkLinkVisible(it.viewName)) continue;
      const enterprise = checkIsEnterprise(it.viewName);
      if (enterprise && edition === 'oss') continue;
      out.push({ name: `${prefix}${it.name || 'Overview'}`, viewName: it.viewName });
    } else if (subtreeHasVisibleLink(it.items, edition)) {
      out.push(...visibleLinks(it.items, edition, `${prefix}${it.name} › `));
    }
  }
  return out;
}

/** Whether a top-level entry has anything left to show once edition and permissions are applied. */
export function topItemVisible(item: LayoutItem, edition: string): boolean {
  if ('link' in item) {
    if (!checkLinkVisible(item.link.viewName)) return false;
    return !(checkIsEnterprise(item.link.viewName) && edition === 'oss');
  }
  return subtreeHasVisibleLink(item.container.items, edition);
}

/** A stable key for a top-level entry, for React lists. */
export function topItemKey(item: LayoutItem): string {
  return 'link' in item ? item.link.viewName : item.container.name;
}

/** Whether this layout is shallow enough to be drawn as a menu bar at all. */
export function fitsSectionNav(layout: Layout, edition: string): boolean {
  return layout.items.filter((item) => topItemVisible(item, edition)).length <= SECTION_NAV_MAX_ITEMS;
}
