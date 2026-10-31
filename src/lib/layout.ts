/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Which navigation links an account sees and may open. Schema objects need
 * read permission on themselves (or, for a view, on what it shows); the
 * console's own pages follow the rules below.
 */
import type { Layout, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';
import { resolveObject } from '@/lib/schemaResolver';
import { SETTINGS_LAYOUT_NAME, SETTINGS_OVERVIEW_VIEW } from '@/lib/settingsLayout';

export type CanGet = (permissionPrefix: string) => boolean;
export type HasPermission = (permission: string) => boolean;

interface Checks {
  edition: string;
  canGet?: CanGet;
  hasPerm?: HasPermission;
}

interface PageRule {
  enterprise: boolean;
  visible: (checks: Checks) => boolean;
}

// Without a check to ask (as when only the enterprise flag is wanted), a rule passes.
const mayRead =
  (...prefixes: string[]): PageRule['visible'] =>
  ({ canGet }) =>
    !canGet || prefixes.every(canGet);
const holds = (permission: string, { hasPerm }: Checks) => !hasPerm || hasPerm(permission);
const notOss = ({ edition }: Checks) => edition !== 'oss';

const DASHBOARD: PageRule = {
  enterprise: true,
  visible: (c) => notOss(c) && holds('liveMetrics', c) && mayRead('sysTrace')(c),
};

const readOnly = (...prefixes: string[]): PageRule => ({ enterprise: false, visible: mayRead(...prefixes) });

/** The console's own pages, by view name. */
const PAGES: Record<string, PageRule> = {
  'CustomComponent/Dashboard': DASHBOARD,
  'CustomComponent/LiveDelivery': { enterprise: false, visible: (c) => holds('liveDeliveryTest', c) },
  'CustomComponent/LiveTracing': { enterprise: true, visible: (c) => notOss(c) && holds('liveTracing', c) },
  // Every check on it is server-wide, so tenant administrators don't see it.
  'CustomComponent/LegacyProtocols': readOnly('sysSecurity'),
  'CustomComponent/LocalAi': readOnly('sysSpamLlm'),
  'CustomComponent/AuditLog': readOnly('sysAudit'),
  'CustomComponent/LegalHolds': readOnly('sysLegalHold'),
  'CustomComponent/ComplianceOverview': readOnly('sysCompliance'),
  'CustomComponent/DataInventory': readOnly('sysCompliance'),
  'CustomComponent/DlpRules': readOnly('sysDlpPolicy'),
  'CustomComponent/Journal': readOnly('sysJournal'),
  'CustomComponent/HeldMail': readOnly('sysDlpReview'),
  'CustomComponent/MailFlowRules': readOnly('sysMailRule'),
  'CustomComponent/Relays': readOnly('sysRelay'),
  'CustomComponent/AccountLocks': readOnly('sysAccountLock'),
  'CustomComponent/SharedMailboxes': readOnly('sysAccountLock'),
  'CustomComponent/Deliverability': readOnly('sysDeliverability'),
  'CustomComponent/ScheduledReports': readOnly('sysScheduledReport'),
  // A migration has no read permission of its own: running one is the right
  'CustomComponent/Migrations': { enterprise: false, visible: (c) => holds('sysMigrationRun', c) },
  // Guided jobs are for whoever may read everything they change.
  'Wizard/certificates': readOnly('sysDomain', 'sysAcmeProvider', 'sysCertificate'),
  'Wizard/sending': readOnly('sysMtaRoute', 'sysMtaOutboundStrategy'),
  'Wizard/directory': readOnly('sysDirectory', 'sysDomain', 'sysAuthentication'),
  'Wizard/limits': readOnly('sysMtaInboundThrottle', 'sysMtaOutboundThrottle', 'sysMtaQueueQuota'),
};

/**
 * A page this console can't draw is hidden: a server newer than the console
 * may list pages it doesn't know yet, and counting them hid the first-boot
 * wizard (inbuxa-server#135).
 */
const UNKNOWN_PAGE: PageRule = { enterprise: false, visible: () => false };

function pageRule(viewName: string): PageRule | null {
  if (viewName.startsWith('Dashboard/')) return DASHBOARD;
  if (viewName.startsWith('Wizard/dns/')) return readOnly('sysDomain');
  return PAGES[viewName] ?? (viewName.startsWith('CustomComponent/') ? UNKNOWN_PAGE : null);
}

/** Every link's view name, top to bottom, going into containers as they come. */
function* linksOf(items: (LayoutItem | LayoutSubItem)[]): Generator<string> {
  for (const item of items) {
    if ('link' in item) yield item.link.viewName;
    else if ('container' in item) yield* linksOf(item.container.items);
    else if (item.type === 'link') yield item.viewName;
    else yield* linksOf(item.items);
  }
}

function firstLink(items: (LayoutItem | LayoutSubItem)[], keep: (viewName: string) => boolean): string | null {
  for (const viewName of linksOf(items)) if (keep(viewName)) return viewName;
  return null;
}

export function isLinkVisible(
  schema: Schema,
  viewName: string,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): boolean {
  // The Settings overview is there when any settings page is. Shown on its
  // own, it made Settings visible to the bootstrap administrator, and the
  // wizard never showed.
  if (viewName === SETTINGS_OVERVIEW_VIEW) {
    const settings = schema.layouts.find((layout) => layout.name === SETTINGS_LAYOUT_NAME);
    const containers = (settings?.items ?? []).flatMap((item) => ('container' in item ? [item.container.items] : []));
    return containers.some((items) => firstLink(items, (v) => isLinkVisible(schema, v, edition, canGet, hasPerm)));
  }

  const rule = pageRule(viewName);
  if (rule) return rule.visible({ edition, canGet, hasPerm });

  const resolved = schema.objects[viewName] ? resolveObject(schema, viewName) : null;
  if (!resolved || !canGet(resolved.permissionPrefix)) return false;
  return !(resolved.enterprise && edition === 'oss');
}

export function isLinkEnterprise(schema: Schema, viewName: string): boolean {
  const rule = pageRule(viewName);
  if (rule) return rule.enterprise;
  const obj = schema.objects[viewName];
  if (obj?.type !== 'view') return obj?.enterprise === true;
  const parent = schema.objects[obj.objectName];
  return parent?.type !== 'view' && parent?.enterprise === true;
}

/** Visible, and not an enterprise page shown to the community edition only as a teaser. */
export function isLinkAccessible(
  schema: Schema,
  viewName: string,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): boolean {
  return (
    isLinkVisible(schema, viewName, edition, canGet, hasPerm) &&
    !(edition === 'community' && isLinkEnterprise(schema, viewName))
  );
}

export function findFirstVisibleLinkInLayout(
  schema: Schema,
  layout: Layout,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  return firstLink(layout.items, (v) => isLinkVisible(schema, v, edition, canGet, hasPerm));
}

export function findFirstAccessibleLinkInLayout(
  schema: Schema,
  layout: Layout,
  edition: string,
  canGet: CanGet,
  hasPerm?: HasPermission,
): string | null {
  return firstLink(layout.items, (v) => isLinkAccessible(schema, v, edition, canGet, hasPerm));
}

/** The layouts with at least one page the account may see. */
export function visibleLayouts(schema: Schema, edition: string, canGet: CanGet, hasPerm?: HasPermission): Layout[] {
  return schema.layouts.filter((layout) => findFirstVisibleLinkInLayout(schema, layout, edition, canGet, hasPerm));
}
