/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createElement, lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';

import { LoadingFallback } from '@/components/common/LoadingFallback';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { DynamicList } from '@/components/lists/DynamicList';
import { DynamicViewPage } from '@/components/views/DynamicViewPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { CertificateSetupCard } from '@/features/certificates/CertificateSetupCard';
import { DirectorySetupCard } from '@/features/directory/DirectorySetupCard';
import { WebhooksPage } from '@/features/events/WebhooksPage';
import { WebhookTestCard } from '@/features/events/WebhookTestCard';
import { LegacyProtocolsBanner } from '@/features/hardening/LegacyProtocolsBanner';
import { DmarcSummaryCard } from '@/features/incomingReports/DmarcSummaryCard';
import { TlsSummaryCard } from '@/features/incomingReports/TlsSummaryCard';
import { LimitsSummary } from '@/features/limits/LimitsSummary';
import type { LimitObject } from '@/features/limits/rules';
import { MetricsPage } from '@/features/metricsConnect/MetricsPage';
import { ListenersPage } from '@/features/ports/ListenersPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { RetentionPage } from '@/features/retention/RetentionPage';
import { SenderChecksPage } from '@/features/senderChecks/SenderChecksPage';
import { SendingSetupCard } from '@/features/sending/SendingSetupCard';
import { SpamSettingsPage } from '@/features/spamLevel/SpamSettingsPage';
import { useAccountStore } from '@/stores/accountStore';
import { useCacheStore } from '@/stores/cacheStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

import { pageRoute } from './pageRoute';

/** A page loaded the first time it's opened. */
function onDemand<M, P>(load: () => Promise<M>, pick: (module: M) => ComponentType<P>) {
  return lazy(() => load().then((module) => ({ default: pick(module) })));
}

const DashboardView = onDemand(
  () => import('@/features/dashboard/components/DashboardView'),
  (m) => m.DashboardView,
);
const TraceDetailView = onDemand(
  () => import('@/features/tracing/components/TraceDetailView'),
  (m) => m.TraceDetailView,
);
const ConnectDnsPage = onDemand(
  () => import('@/features/dns/ConnectDnsPage'),
  (m) => m.ConnectDnsPage,
);
const ActionPage = onDemand(
  () => import('@/features/actions/ActionPage'),
  (m) => m.ActionPage,
);
const HeldNotice = onDemand(
  () => import('@/features/hold/HeldNotice'),
  (m) => m.HeldNotice,
);
const AccountLockBanner = onDemand(
  () => import('@/features/lock/AccountLockBanner'),
  (m) => m.AccountLockBanner,
);
const SharingSwitches = onDemand(
  () => import('@/features/sharing/SharingSwitches'),
  (m) => m.SharingSwitches,
);
const TenantLegacyProtocols = onDemand(
  () => import('@/features/hardening/TenantLegacyProtocols'),
  (m) => m.TenantLegacyProtocols,
);

/** The console's own pages, by the name after `CustomComponent/`. */
const CUSTOM_PAGES: Record<string, ComponentType> = {
  LiveDelivery: onDemand(
    () => import('@/features/troubleshoot/DeliveryTracePage'),
    (m) => m.DeliveryTracePage,
  ),
  LiveTracing: onDemand(
    () => import('@/features/tracing/components/LiveTracingPage'),
    (m) => m.LiveTracingPage,
  ),
  // The security to-do list, which holds the legacy-protocols switch.
  LegacyProtocols: onDemand(
    () => import('@/features/security/SecurityPage'),
    (m) => m.SecurityPage,
  ),
  SettingsOverview: onDemand(
    () => import('@/features/settings/SettingsOverviewPage'),
    (m) => m.SettingsOverviewPage,
  ),
  LocalAi: onDemand(
    () => import('@/features/ai/LocalAiPage'),
    (m) => m.LocalAiPage,
  ),
  AuditLog: onDemand(
    () => import('@/features/audit/AuditLogPage'),
    (m) => m.AuditLogPage,
  ),
  AccountLocks: onDemand(
    () => import('@/features/lock/AccountLocksPage'),
    (m) => m.AccountLocksPage,
  ),
  SharedMailboxes: onDemand(
    () => import('@/features/lock/SharedMailboxesPage'),
    (m) => m.SharedMailboxesPage,
  ),
  Deliverability: onDemand(
    () => import('@/features/deliverability/DeliverabilityPage'),
    (m) => m.DeliverabilityPage,
  ),
  ScheduledReports: onDemand(
    () => import('@/features/scheduledReports/ScheduledReportsPage'),
    (m) => m.ScheduledReportsPage,
  ),
  LegalHolds: onDemand(
    () => import('@/features/hold/LegalHoldsPage'),
    (m) => m.LegalHoldsPage,
  ),
  ComplianceOverview: onDemand(
    () => import('@/features/compliance/ComplianceOverviewPage'),
    (m) => m.ComplianceOverviewPage,
  ),
  DlpRules: onDemand(
    () => import('@/features/dlp/RulesPage'),
    (m) => m.DlpRulesPage,
  ),
  MailFlowRules: onDemand(
    () => import('@/features/dlp/RulesPage'),
    (m) => m.MailFlowRulesPage,
  ),
  Relays: onDemand(
    () => import('@/features/relays/RelaysPage'),
    (m) => m.RelaysPage,
  ),
  Migrations: onDemand(
    () => import('@/features/migrations/MigrationsPage'),
    (m) => m.MigrationsPage,
  ),
  Journal: onDemand(
    () => import('@/features/journal/JournalPage'),
    (m) => m.JournalPage,
  ),
  HeldMail: onDemand(
    () => import('@/features/dlp/HeldMailPage'),
    (m) => m.HeldMailPage,
  ),
  DataInventory: onDemand(
    () => import('@/features/compliance/DataInventoryPage'),
    (m) => m.DataInventoryPage,
  ),
};

/** Guided jobs, by the name after `Wizard/`; always reached by choosing "Guide me", never by default. */
const WIZARDS: Record<string, ComponentType> = {
  limits: onDemand(
    () => import('@/features/limits/LimitsSetupPage'),
    (m) => m.LimitsSetupPage,
  ),
  directory: onDemand(
    () => import('@/features/directory/DirectorySetupPage'),
    (m) => m.DirectorySetupPage,
  ),
  sending: onDemand(
    () => import('@/features/sending/SendingSetupPage'),
    (m) => m.SendingSetupPage,
  ),
  certificates: onDemand(
    () => import('@/features/certificates/CertificateSetupPage'),
    (m) => m.CertificateSetupPage,
  ),
};

const stacked = (...parts: ReactNode[]) => createElement('div', { className: 'space-y-4' }, ...parts);
const settingsForm = (viewName: string) => <DynamicForm viewName={viewName} objectId="singleton" />;
const reportsPage = (viewName: string) => <ReportsPage viewName={viewName} />;

/** Settings pages that open with something above, or in place of, the plain form. */
const SINGLETON_PAGES: Record<string, (viewName: string) => ReactNode> = {
  'x:Authentication': (v) => stacked(<DirectorySetupCard className="mx-auto max-w-4xl" />, settingsForm(v)),
  // Sender checks open with a choice of level.
  'x:SenderAuth': (v) => <SenderChecksPage viewName={v} />,
  // Every retention page opens with all the "how long"s as sentences.
  'x:DataRetention': (v) => <RetentionPage viewName={v} />,
  // Every report page opens with what goes out and comes in.
  'x:ReportSettings': reportsPage,
  'x:DmarcReportSettings': reportsPage,
  'x:TlsReportSettings': reportsPage,
  'x:DkimReportSettings': reportsPage,
  'x:SpfReportSettings': reportsPage,
  'x:DsnReportSettings': reportsPage,
  // The metrics pages open with where the numbers go.
  'x:Metrics': (v) => <MetricsPage viewName={v} />,
  // Spam filter › General opens with how hard the filter is.
  'x:SpamSettings': (v) => <SpamSettingsPage viewName={v} />,
  'x:Sharing': (v) => stacked(<SharingSwitches />, settingsForm(v)),
  'x:Security': (v) => stacked(<LegacyProtocolsBanner />, settingsForm(v)),
  'x:MtaOutboundStrategy': (v) => stacked(<SendingSetupCard className="mx-auto max-w-4xl" />, settingsForm(v)),
};

const listUnder = (above: ReactNode) => (viewName: string) => stacked(above, <DynamicList viewName={viewName} />);
const limitsList = (object: LimitObject) => () =>
  stacked(<LimitsSummary object={object} />, <DynamicList viewName={object} />);

/** Lists that open with a guide or a summary above them, or have a page of their own. */
const LIST_PAGES: Record<string, (viewName: string) => ReactNode> = {
  'x:Certificate': listUnder(<CertificateSetupCard />),
  'x:AcmeProvider': listUnder(<CertificateSetupCard />),
  // Received reports open with who sends as us and whether they pass.
  'x:DmarcExternalReport': listUnder(<DmarcSummaryCard />),
  'x:TlsExternalReport': listUnder(<TlsSummaryCard />),
  'x:MtaRoute': listUnder(<SendingSetupCard />),
  'x:Directory': listUnder(<DirectorySetupCard />),
  'x:MtaInboundThrottle': limitsList('x:MtaInboundThrottle'),
  'x:MtaOutboundThrottle': limitsList('x:MtaOutboundThrottle'),
  'x:MtaQueueQuota': limitsList('x:MtaQueueQuota'),
  'x:Alert': (v) => <AlertsPage viewName={v} />,
  'x:NetworkListener': (v) => <ListenersPage viewName={v} />,
  'x:WebHook': (v) => <WebhooksPage viewName={v} />,
};

const unknown = (text: string) => (
  <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{text}</div>
);

function recordPage(viewName: string, objectName: string, permissionPrefix: string, id: string): ReactNode {
  if (objectName === 'x:Trace') return <TraceDetailView viewName={viewName} objectId={id} />;
  const page = useAccountStore.getState().hasObjectPermission(permissionPrefix, 'Update') ? (
    <DynamicForm
      viewName={viewName}
      objectId={id}
      intro={objectName === 'x:WebHook' ? <WebhookTestCard webhookId={id} /> : undefined}
    />
  ) : (
    <DynamicViewPage viewName={viewName} objectId={id} />
  );
  // A tenant administrator reads their tenant without changing it, yet may
  // still turn its legacy-protocols switch, so it shows on the read-only page too.
  if (objectName === 'x:Tenant') {
    return stacked(<TenantLegacyProtocols tenantId={id} />, <SharingSwitches tenantId={id} />, page);
  }
  // A person's page says whether they're on hold or locked.
  if (viewName === 'x:Account/User') {
    return stacked(<HeldNotice accountId={id} />, <AccountLockBanner accountId={id} />, page);
  }
  return page;
}

function pageFor(
  schema: Schema | null,
  viewName: string | undefined,
  id: string | undefined,
  section: string | undefined,
): ReactNode {
  const route = pageRoute(schema, viewName, id);
  const view = viewName ?? '';
  switch (route.kind) {
    case 'none':
      return <LoadingFallback />;
    case 'dashboard':
      return <DashboardView dashboardId={route.dashboardId} section={section ?? ''} />;
    case 'wizard': {
      if (route.name === 'dns' && route.param) return <ConnectDnsPage domainId={route.param} />;
      const Wizard = WIZARDS[route.name];
      return Wizard ? <Wizard /> : unknown(`Unknown guide: ${route.name}`);
    }
    case 'custom': {
      const Page = CUSTOM_PAGES[route.name];
      return Page ? <Page /> : unknown(`Unknown component: ${route.name}`);
    }
    case 'schema-loading':
      return <div className="flex items-center justify-center p-8 text-muted-foreground">Loading...</div>;
    case 'unknown':
      return <div className="flex items-center justify-center p-8 text-destructive">Unknown view: {view}</div>;
    case 'action':
      return <ActionPage viewName={view} />;
    case 'singleton':
      return (SINGLETON_PAGES[route.objectName] ?? settingsForm)(view);
    case 'create':
      return <DynamicForm viewName={view} objectId={null} />;
    case 'record':
      return recordPage(view, route.objectName, route.permissionPrefix, route.id);
    case 'list':
      return LIST_PAGES[view]?.(view) ?? <DynamicList viewName={view} />;
  }
}

interface MainContentProps {
  viewName?: string;
  id?: string;
  section?: string;
}

/** The page an address names, under the shell. Lists are fetched fresh on every page change. */
export function MainContent({ viewName, id, section }: MainContentProps) {
  const schema = useSchemaStore((s) => s.schema);
  const invalidateAllObjectLists = useCacheStore((s) => s.invalidateAllObjectLists);

  useEffect(() => {
    invalidateAllObjectLists();
  }, [viewName, invalidateAllObjectLists]);

  return <Suspense fallback={<LoadingFallback />}>{pageFor(schema, viewName, id, section)}</Suspense>;
}
