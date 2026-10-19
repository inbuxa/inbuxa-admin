/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Walking the server's menu tree for the two shells that draw it: the
 * sidebar and the section bar. The tree is the schema's `layouts`, so
 * neither may assume a depth or a fan-out.
 */
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { isLinkEnterprise, isLinkVisible } from '@/lib/layout';
import type { Layout, LayoutItem, LayoutSubItem } from '@/types/schema';

/**
 * Past this many top-level entries a layout is a settings browser more than
 * a set of places, and a menu bar stops helping however wide the window. On
 * the stock schema that's Settings, with nineteen groups, which keeps the
 * sidebar in either shell; Management (nine) and Account (eleven) fit, with
 * anything left over in the section bar's "More".
 */
export const SECTION_NAV_MAX_ITEMS = 12;

export function resolveViewPath(sectionName: string, viewName: string): string {
  return `/${sectionName}/${viewName}`;
}

/** Whether the address is this link's page, or a record on it. */
export function pathMatchesView(currentPath: string, sectionName: string, viewName: string): boolean {
  const page = resolveViewPath(sectionName, viewName);
  if (currentPath === page) return true;
  if (currentPath.startsWith(`${page}/`)) {
    // A view under this one is its own page, not a record: x:Metrics/CollectorPrometheus
    // shouldn't light up x:Metrics as well.
    const next = decodeURIComponent(currentPath.slice(page.length + 1).split('/')[0]);
    return !useSchemaStore.getState().schema?.objects[`${viewName}/${next}`];
  }
  return viewName === 'CustomComponent/Dashboard' && currentPath.startsWith(`/${sectionName}/Dashboard/`);
}

/** Whether the signed-in account may see this link; every link counts until the schema loads. */
export function checkLinkVisible(viewName: string): boolean {
  const schema = useSchemaStore.getState().schema;
  if (!schema) return true;
  const account = useAccountStore.getState();
  return isLinkVisible(
    schema,
    viewName,
    account.edition,
    (prefix) => account.hasObjectPermission(prefix, 'Get'),
    (perm) => account.hasPermission(perm),
  );
}

export function checkIsEnterprise(viewName: string): boolean {
  const schema = useSchemaStore.getState().schema;
  return schema ? isLinkEnterprise(schema, viewName) : false;
}

/** Visible to this account, and not an enterprise page on the open-source edition. */
function linkShows(viewName: string, edition: string): boolean {
  return checkLinkVisible(viewName) && !(edition === 'oss' && checkIsEnterprise(viewName));
}

export function subtreeContainsActive(items: LayoutSubItem[], currentPath: string, sectionName: string): boolean {
  return items.some((item) =>
    item.type === 'link'
      ? pathMatchesView(currentPath, sectionName, item.viewName)
      : subtreeContainsActive(item.items, currentPath, sectionName),
  );
}

export function subtreeHasVisibleLink(items: LayoutSubItem[], edition: string): boolean {
  return items.some((item) =>
    item.type === 'link' ? linkShows(item.viewName, edition) : subtreeHasVisibleLink(item.items, edition),
  );
}

/** Every visible link under a container, flattened, deeper names prefixed with their group. */
export function visibleLinks(
  items: LayoutSubItem[],
  edition: string,
  prefix = '',
): { name: string; viewName: string }[] {
  return items.flatMap((item) => {
    if (item.type === 'link') {
      return linkShows(item.viewName, edition)
        ? [{ name: `${prefix}${item.name || 'Overview'}`, viewName: item.viewName }]
        : [];
    }
    return visibleLinks(item.items, edition, `${prefix}${item.name} › `);
  });
}

/** Whether a top-level entry has anything left to show once edition and permissions are applied. */
export function topItemVisible(item: LayoutItem, edition: string): boolean {
  return 'link' in item ? linkShows(item.link.viewName, edition) : subtreeHasVisibleLink(item.container.items, edition);
}

/** A stable key for a top-level entry, for React lists. */
export function topItemKey(item: LayoutItem): string {
  return 'link' in item ? item.link.viewName : item.container.name;
}

/** Whether this layout is shallow enough to be drawn as a menu bar at all. */
export function fitsSectionNav(layout: Layout, edition: string): boolean {
  return layout.items.filter((item) => topItemVisible(item, edition)).length <= SECTION_NAV_MAX_ITEMS;
}
