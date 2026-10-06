/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import type { Layout, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';
import { resolveObject } from '@/lib/schemaResolver';
import { SETTINGS_LAYOUT_NAME, SETTINGS_OVERVIEW_VIEW } from '@/lib/settingsLayout';

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

  // INBUXA: the security to-do list and the legacy-protocols switch. Every
  // check is server-wide, so it's for whoever may read the server's security
  // settings, which tenant administrators can't (security to-do list spec).
  if (viewName === 'CustomComponent/LegacyProtocols') {
    return { visible: canGet ? canGet('sysSecurity') : true, enterprise: false };
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

  // INBUXA: DLP and mail flow rules, and held mail (dlp-and-mail-flow-rules spec, §2.8)
  if (viewName === 'CustomComponent/DlpRules') {
    return { visible: canGet ? canGet('sysDlpPolicy') : true, enterprise: false };
  }
  // INBUXA: journaling (journaling spec, §3)
  if (viewName === 'CustomComponent/Journal') {
    return { visible: canGet ? canGet('sysJournal') : true, enterprise: false };
  }
  if (viewName === 'CustomComponent/HeldMail') {
    return { visible: canGet ? canGet('sysDlpReview') : true, enterprise: false };
  }
  if (viewName === 'CustomComponent/MailFlowRules') {
    return { visible: canGet ? canGet('sysMailRule') : true, enterprise: false };
  }

  // inbuxa: locked accounts, for whoever may see them (AL-12).
  if (viewName === 'CustomComponent/AccountLocks') {
    return { visible: canGet ? canGet('sysAccountLock') : true, enterprise: false };
  }
  // inbuxa: shared mailboxes are locks of their own kind (MA-S4)
  if (viewName === 'CustomComponent/SharedMailboxes') {
    return { visible: canGet ? canGet('sysAccountLock') : true, enterprise: false };
  }
  // inbuxa: Domains › Deliverability, for whoever may read the reports (deliverability spec)
  if (viewName === 'CustomComponent/Deliverability') {
    return { visible: canGet ? canGet('sysDeliverability') : true, enterprise: false };
  }

  // INBUXA: a page this console can't draw is hidden. A server newer than the
  // console lists pages the console doesn't know yet, and counting them as
  // visible hid the first-boot wizard (inbuxa-server#135).
  if (viewName.startsWith('CustomComponent/')) {
    return { visible: false, enterprise: false };
  }

  // INBUXA: guided jobs are open to whoever may manage what they change.
  if (viewName === 'Wizard/certificates') {
    const ok = canGet ? canGet('sysDomain') && canGet('sysAcmeProvider') && canGet('sysCertificate') : true;
    return { visible: ok, enterprise: false };
  }
  if (viewName === 'Wizard/sending') {
    const ok = canGet ? canGet('sysMtaRoute') && canGet('sysMtaOutboundStrategy') : true;
    return { visible: ok, enterprise: false };
  }
  if (viewName === 'Wizard/directory') {
    const ok = canGet ? canGet('sysDirectory') && canGet('sysDomain') && canGet('sysAuthentication') : true;
    return { visible: ok, enterprise: false };
  }
  if (viewName === 'Wizard/limits') {
    const ok = canGet
      ? canGet('sysMtaInboundThrottle') && canGet('sysMtaOutboundThrottle') && canGet('sysMtaQueueQuota')
      : true;
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
  // INBUXA: the Settings overview is the console's own page, there when any
  // settings page is. Visible on its own, it made the Settings layout visible
  // to the bootstrap administrator, and the wizard never showed.
  if (viewName === SETTINGS_OVERVIEW_VIEW) {
    const settings = schema.layouts.find((layout) => layout.name === SETTINGS_LAYOUT_NAME);
    return (
      settings?.items.some(
        (item) =>
          'container' in item &&
          findFirstVisibleSubLink(schema, item.container.items, edition, canGet, hasPerm) !== null,
      ) ?? false
    );
  }

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
