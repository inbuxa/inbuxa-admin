/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import type { Layout, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';
import { resolveObject } from '@/lib/schemaResolver';

function findFirstSubLink(items: LayoutSubItem[]): string | null {
  for (const item of items) {
    if (item.type === 'link') return item.viewName;
    if (item.type === 'container') {
      const found = findFirstSubLink(item.items);
      if (found) return found;
    }
  }
  return null;
}

export function findFirstLinkInLayout(items: LayoutItem[] | Layout): string | null {
  const list = Array.isArray(items) ? items : items.items;
  for (const item of list) {
    if ('link' in item) return item.link.viewName;
    if ('container' in item) {
      const found = findFirstSubLink(item.container.items);
      if (found) return found;
    }
  }
  return null;
}

export type CanGet = (permissionPrefix: string) => boolean;
export type HasPermission = (permission: string) => boolean;

interface SpecialLinkInfo {
  visible: boolean;
  enterprise: boolean;
}

function checkSpecialLink(
  viewName: string,
  edition: string,
  hasPerm?: HasPermission,
  canGet?: CanGet,
): SpecialLinkInfo | null {
  if (viewName.startsWith('Dashboard/') || viewName === 'CustomComponent/Dashboard') {
    if (edition === 'oss') return { visible: false, enterprise: true };
    const hasLiveMetrics = hasPerm ? hasPerm('liveMetrics') : true;
    const hasTraceGet = canGet ? canGet('sysTrace') : true;
    return { visible: hasLiveMetrics && hasTraceGet, enterprise: true };
  }

  if (viewName === 'CustomComponent/LiveDelivery') {
    const allowed = hasPerm ? hasPerm('liveDeliveryTest') : true;
    return { visible: allowed, enterprise: false };
  }

  if (viewName === 'CustomComponent/LiveTracing') {
    if (edition === 'oss') return { visible: false, enterprise: true };
    const allowed = hasPerm ? hasPerm('liveTracing') : true;
    return { visible: allowed, enterprise: true };
  }

  // INBUXA: the legacy protocols switch takes listeners away and puts them back,
  // so whoever may see a listener may see it (legacy-protocols spec).
  if (viewName === 'CustomComponent/LegacyProtocols') {
    return { visible: canGet ? canGet('sysNetworkListener') : true, enterprise: false };
  }

  // inbuxa: the Local AI page is for whoever may see the AI classifier.
  if (viewName === 'CustomComponent/LocalAi') {
    return { visible: canGet ? canGet('sysSpamLlm') : true, enterprise: false };
  }

  // inbuxa: the audit log, for whoever may read it (AU-9).
  if (viewName === 'CustomComponent/AuditLog') {
    return { visible: canGet ? canGet('sysAudit') : true, enterprise: false };
  }

  // inbuxa: legal holds, for server administrators who may see them (LH-13).
  if (viewName === 'CustomComponent/LegalHolds') {
    return { visible: canGet ? canGet('sysLegalHold') : true, enterprise: false };
  }
  // INBUXA: the compliance overview and data inventory (personal-data catalog)
  if (viewName === 'CustomComponent/ComplianceOverview' || viewName === 'CustomComponent/DataInventory') {
    return { visible: canGet ? canGet('sysCompliance') : true, enterprise: false };
  }

  // inbuxa: locked accounts, for whoever may see them (AL-12).
  if (viewName === 'CustomComponent/AccountLocks') {
    return { visible: canGet ? canGet('sysAccountLock') : true, enterprise: false };
  }

  if (viewName.startsWith('CustomComponent/')) {
    return { visible: true, enterprise: false };
  }

  // INBUXA: guided jobs are open to whoever may manage what they change.
  if (viewName === 'Wizard/sending') {
    const ok = canGet ? canGet('sysMtaRoute') && canGet('sysMtaOutboundStrategy') : true;
    return { visible: ok, enterprise: false };
  }
  if (viewName.startsWith('Wizard/dns/')) {
    return { visible: canGet ? canGet('sysDomain') : true, enterprise: false };
  }

  return null;
}

export function isLinkVisible(
  schema: Schema,
  viewName: string,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): boolean {
  const special = checkSpecialLink(viewName, edition, hasPerm, canGet);
  if (special !== null) return special.visible;

  const obj = schema.objects[viewName];
  if (!obj) return false;
  const resolved = resolveObject(schema, viewName);
  if (!resolved) return false;

  if (!canGet(resolved.permissionPrefix)) return false;

  if (resolved.enterprise && edition === 'oss') return false;

  return true;
}

export function isLinkEnterprise(schema: Schema, viewName: string, edition: string): boolean {
  const special = checkSpecialLink(viewName, edition);
  if (special !== null) return special.enterprise;

  const obj = schema.objects[viewName];
  if (!obj) return false;
  if (obj.type === 'view') {
    const parent = schema.objects[obj.objectName];
    return parent?.type !== 'view' && parent?.enterprise === true;
  }
  return obj.enterprise === true;
}

function findFirstVisibleSubLink(
  schema: Schema,
  items: LayoutSubItem[],
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  for (const item of items) {
    if (item.type === 'link') {
      if (isLinkVisible(schema, item.viewName, edition, canGet, hasPerm)) return item.viewName;
    } else if (item.type === 'container') {
      const found = findFirstVisibleSubLink(schema, item.items, edition, canGet, hasPerm);
      if (found) return found;
    }
  }
  return null;
}

export function findFirstVisibleLinkInLayout(
  schema: Schema,
  layout: Layout,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  for (const item of layout.items) {
    if ('link' in item) {
      if (isLinkVisible(schema, item.link.viewName, edition, canGet, hasPerm)) return item.link.viewName;
    } else if ('container' in item) {
      const found = findFirstVisibleSubLink(schema, item.container.items, edition, canGet, hasPerm);
      if (found) return found;
    }
  }
  return null;
}

export function isLinkAccessible(
  schema: Schema,
  viewName: string,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): boolean {
  if (!isLinkVisible(schema, viewName, edition, canGet, hasPerm)) return false;
  if (edition === 'community' && isLinkEnterprise(schema, viewName, edition)) return false;
  return true;
}

function findFirstAccessibleSubLink(
  schema: Schema,
  items: LayoutSubItem[],
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  for (const item of items) {
    if (item.type === 'link') {
      if (isLinkAccessible(schema, item.viewName, edition, canGet, hasPerm)) return item.viewName;
    } else if (item.type === 'container') {
      const found = findFirstAccessibleSubLink(schema, item.items, edition, canGet, hasPerm);
      if (found) return found;
    }
  }
  return null;
}

export function findFirstAccessibleLinkInLayout(
  schema: Schema,
  layout: Layout,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  for (const item of layout.items) {
    if ('link' in item) {
      if (isLinkAccessible(schema, item.link.viewName, edition, canGet, hasPerm)) return item.link.viewName;
    } else if ('container' in item) {
      const found = findFirstAccessibleSubLink(schema, item.container.items, edition, canGet, hasPerm);
      if (found) return found;
    }
  }
  return null;
}

export function visibleLayouts(schema: Schema, edition: string, canGet: CanGet, hasPerm?: HasPermission): Layout[] {
  return schema.layouts.filter(
    (layout) => findFirstVisibleLinkInLayout(schema, layout, edition, canGet, hasPerm) !== null,
  );
}
