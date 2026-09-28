/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useCacheStore } from '@/stores/cacheStore';
import { useAccountStore } from '@/stores/accountStore';
import { resolveObject } from '@/lib/schemaResolver';
import { DynamicList } from '@/components/lists/DynamicList';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { DynamicViewPage } from '@/components/views/DynamicViewPage';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { LegacyProtocolsBanner } from '@/features/hardening/LegacyProtocolsBanner';
import { WebhooksPage } from '@/features/events/WebhooksPage';
import { ListenersPage } from '@/features/ports/ListenersPage';
import { MetricsPage } from '@/features/metricsConnect/MetricsPage';
import { AlertsPage } from '@/features/alerts/AlertsPage';
import { ReportsPage } from '@/features/reports/ReportsPage';
import { RetentionPage } from '@/features/retention/RetentionPage';
import { LimitsSummary } from '@/features/limits/LimitsSummary';
import { SenderChecksPage } from '@/features/senderChecks/SenderChecksPage';
import { DirectorySetupCard } from '@/features/directory/DirectorySetupCard';
import { SendingSetupCard } from '@/features/sending/SendingSetupCard';
import { CertificateSetupCard } from '@/features/certificates/CertificateSetupCard';
import type { Schema } from '@/types/schema';

function lazyFeature<M, P>(load: () => Promise<M>, select: (module: M) => ComponentType<P>) {
  return lazy(() => load().then((module) => ({ default: select(module) })));
}

const DashboardView = lazyFeature(
  () => import('@/features/dashboard/components/DashboardView'),
  (m) => m.DashboardView,
);
const DeliveryTracePage = lazyFeature(
  () => import('@/features/troubleshoot/DeliveryTracePage'),
  (m) => m.DeliveryTracePage,
);
const LiveTracingPage = lazyFeature(
  () => import('@/features/tracing/components/LiveTracingPage'),
  (m) => m.LiveTracingPage,
);
const TraceDetailView = lazyFeature(
  () => import('@/features/tracing/components/TraceDetailView'),
  (m) => m.TraceDetailView,
);
const ConnectDnsPage = lazyFeature(
  () => import('@/features/dns/ConnectDnsPage'),
  (m) => m.ConnectDnsPage,
);
const ActionPage = lazyFeature(
  () => import('@/features/actions/ActionPage'),
  (m) => m.ActionPage,
);
const LegacyProtocolsPage = lazyFeature(
  () => import('@/features/hardening/LegacyProtocolsPage'),
  (m) => m.LegacyProtocolsPage,
);
// inbuxa: Management › Compliance › Overview and Data Inventory
// (personal-data catalog spec, §8).
const ComplianceOverviewPage = lazyFeature(
  () => import('@/features/compliance/ComplianceOverviewPage'),
  (m) => m.ComplianceOverviewPage,
);
const DataInventoryPage = lazyFeature(
  () => import('@/features/compliance/DataInventoryPage'),
  (m) => m.DataInventoryPage,
);
// inbuxa: Settings › Overview (settings-reorg spec).
const CertificateSetupPage = lazyFeature(
  () => import('@/features/certificates/CertificateSetupPage'),
  (m) => m.CertificateSetupPage,
);
const SendingSetupPage = lazyFeature(
  () => import('@/features/sending/SendingSetupPage'),
  (m) => m.SendingSetupPage,
);
const SettingsOverviewPage = lazyFeature(
  () => import('@/features/settings/SettingsOverviewPage'),
  (m) => m.SettingsOverviewPage,
);
// inbuxa: guided setup, connect a sign-in directory (settings-reorg spec).
const DirectorySetupPage = lazyFeature(
  () => import('@/features/directory/DirectorySetupPage'),
  (m) => m.DirectorySetupPage,
);
// inbuxa: guided setup, sending and receiving limits (settings-reorg spec).
const LimitsSetupPage = lazyFeature(
  () => import('@/features/limits/LimitsSetupPage'),
  (m) => m.LimitsSetupPage,
);
// inbuxa: Settings › Spam filter › Local AI (ai-spam-classification spec).
const LocalAiPage = lazyFeature(
  () => import('@/features/ai/LocalAiPage'),
  (m) => m.LocalAiPage,
);
// inbuxa: Management › Compliance › Audit Log (audit-hold-lock spec, AU-9).
const AuditLogPage = lazyFeature(
  () => import('@/features/audit/AuditLogPage'),
  (m) => m.AuditLogPage,
);
// inbuxa: Management › Compliance › Locked accounts (audit-hold-lock spec, AL-1).
const AccountLocksPage = lazyFeature(
  () => import('@/features/lock/AccountLocksPage'),
  (m) => m.AccountLocksPage,
);
const LegalHoldsPage = lazyFeature(
  () => import('@/features/hold/LegalHoldsPage'),
  (m) => m.LegalHoldsPage,
);
const HeldNotice = lazyFeature(
  () => import('@/features/hold/HeldNotice'),
  (m) => m.HeldNotice,
);
const AccountLockBanner = lazyFeature(
  () => import('@/features/lock/AccountLockBanner'),
  (m) => m.AccountLockBanner,
);
const TenantLegacyProtocols = lazyFeature(
  () => import('@/features/hardening/TenantLegacyProtocols'),
  (m) => m.TenantLegacyProtocols,
);

interface MainContentProps {
  viewName?: string;
  id?: string;
  section?: string;
}

export function MainContent({ viewName, id, section }: MainContentProps) {
  const schema = useSchemaStore((s) => s.schema);
  const invalidateAllObjectLists = useCacheStore((s) => s.invalidateAllObjectLists);

  useEffect(() => {
    invalidateAllObjectLists();
  }, [viewName, invalidateAllObjectLists]);

  return <Suspense fallback={<LoadingFallback />}>{renderView(schema, viewName, id, section)}</Suspense>;
}

function renderView(schema: Schema | null, viewName?: string, id?: string, section?: string): ReactNode {
  if (!viewName) {
    return <LoadingFallback />;
  }

  if (viewName.startsWith('Dashboard/')) {
    const dashboardId = viewName.slice('Dashboard/'.length);
    return <DashboardView dashboardId={dashboardId} section={section ?? ''} />;
  }

  // INBUXA: guided jobs. Always reached by choosing "Guide me", never by default.
  if (viewName.startsWith('Wizard/')) {
    const [, wizard, param] = viewName.split('/');
    if (wizard === 'dns' && param) {
      return <ConnectDnsPage domainId={param} />;
    }
    // inbuxa: guided setup, sending and receiving limits (settings-reorg).
    if (wizard === 'limits') {
      return <LimitsSetupPage />;
    }
    // inbuxa: guided setup, connect a sign-in directory (settings-reorg).
    if (wizard === 'directory') {
      return <DirectorySetupPage />;
    }
    // inbuxa: guided setup, how this server sends mail (settings-reorg).
    if (wizard === 'sending') {
      return <SendingSetupPage />;
    }
    // inbuxa: guided setup, automatic certificates (settings-reorg).
    if (wizard === 'certificates') {
      return <CertificateSetupPage />;
    }
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        Unknown guide: {wizard}
      </div>
    );
  }

  if (viewName.startsWith('CustomComponent/')) {
    const componentName = viewName.slice('CustomComponent/'.length);
    if (componentName === 'Dashboard') {
      const firstId = schema?.dashboards?.[0]?.id ?? 'overview';
      return <DashboardView dashboardId={firstId} section={section ?? ''} />;
    }
    if (componentName === 'LiveDelivery') {
      return <DeliveryTracePage />;
    }
    if (componentName === 'LiveTracing') {
      return <LiveTracingPage />;
    }
    // INBUXA: Settings › Security › Hardening (legacy-protocols spec).
    if (componentName === 'LegacyProtocols') {
      return <LegacyProtocolsPage />;
    }
    // inbuxa: Settings › Overview (settings-reorg).
    if (componentName === 'SettingsOverview') {
      return <SettingsOverviewPage />;
    }
    if (componentName === 'LocalAi') {
      return <LocalAiPage />;
    }
    if (componentName === 'AuditLog') {
      return <AuditLogPage />;
    }
    if (componentName === 'AccountLocks') {
      return <AccountLocksPage />;
    }
    if (componentName === 'LegalHolds') {
      return <LegalHoldsPage />;
    }
    if (componentName === 'ComplianceOverview') {
      return <ComplianceOverviewPage />;
    }
    if (componentName === 'DataInventory') {
      return <DataInventoryPage />;
    }
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        Unknown component: {componentName}
      </div>
    );
  }

  if (!schema) {
    return <div className="flex items-center justify-center p-8 text-muted-foreground">Loading...</div>;
  }

  const resolved = resolveObject(schema, viewName);
  if (!resolved) {
    return <div className="flex items-center justify-center p-8 text-destructive">Unknown view: {viewName}</div>;
  }

  if (resolved.objectName === 'x:Action') {
    return <ActionPage viewName={viewName} />;
  }

  if (resolved.objectType.type === 'singleton') {
    // INBUXA: the Security settings carry the legacy protocols banner (LP-18).
    if (resolved.objectName === 'x:Authentication') {
      return (
        <div className="space-y-4">
          <DirectorySetupCard className="mx-auto max-w-4xl" />
          <DynamicForm viewName={viewName} objectId="singleton" />
        </div>
      );
    }
    // inbuxa: Sender checks open with a choice of level (settings-reorg).
    if (resolved.objectName === 'x:SenderAuth') {
      return <SenderChecksPage viewName={viewName} />;
    }
    // inbuxa: every retention page opens with all the "how long"s as sentences (settings-reorg).
    if (resolved.objectName === 'x:DataRetention') {
      return <RetentionPage viewName={viewName} />;
    }
    // inbuxa: every report page opens with what goes out and comes in (settings-reorg).
    if (
      [
        'x:ReportSettings',
        'x:DmarcReportSettings',
        'x:TlsReportSettings',
        'x:DkimReportSettings',
        'x:SpfReportSettings',
        'x:DsnReportSettings',
      ].includes(resolved.objectName)
    ) {
      return <ReportsPage viewName={viewName} />;
    }
    // inbuxa: the metrics pages open with where the numbers go (settings-reorg).
    if (resolved.objectName === 'x:Metrics') {
      return <MetricsPage viewName={viewName} />;
    }
    if (resolved.objectName === 'x:Security') {
      return (
        <div className="space-y-4">
          <LegacyProtocolsBanner />
          <DynamicForm viewName={viewName} objectId="singleton" />
        </div>
      );
    }
    // inbuxa: the sending guide, offered where outbound delivery is set (settings-reorg).
    if (resolved.objectName === 'x:MtaOutboundStrategy') {
      return (
        <div className="space-y-4">
          <SendingSetupCard className="mx-auto max-w-4xl" />
          <DynamicForm viewName={viewName} objectId="singleton" />
        </div>
      );
    }
    return <DynamicForm viewName={viewName} objectId="singleton" />;
  }

  if (id === 'new') {
    return <DynamicForm viewName={viewName} objectId={null} />;
  }

  if (id) {
    if (resolved.objectName === 'x:Trace') {
      return <TraceDetailView viewName={viewName} objectId={id} />;
    }
    const canUpdate = useAccountStore.getState().hasObjectPermission(resolved.permissionPrefix, 'Update');
    const page = canUpdate ? (
      <DynamicForm viewName={viewName} objectId={id} />
    ) : (
      <DynamicViewPage viewName={viewName} objectId={id} />
    );
    // INBUXA: a tenant's page carries its legacy protocols switch (LP-9). A
    // tenant admin reads its tenant without changing it (MT-12), and may
    // still turn the switch, so it shows on the read-only page too.
    if (resolved.objectName === 'x:Tenant') {
      return (
        <div className="space-y-4">
          <TenantLegacyProtocols tenantId={id} />
          {page}
        </div>
      );
    }
    // INBUXA: a person's page says whether it is locked (AL-1)
    if (viewName === 'x:Account/User') {
      return (
        <div className="space-y-4">
          <HeldNotice accountId={id} />
          <AccountLockBanner accountId={id} />
          {page}
        </div>
      );
    }
    return page;
  }

  if (viewName === 'x:Certificate' || viewName === 'x:AcmeProvider') {
    return (
      <div className="space-y-4">
        <CertificateSetupCard />
        <DynamicList viewName={viewName} />
      </div>
    );
  }
  if (viewName === 'x:MtaRoute') {
    return (
      <div className="space-y-4">
        <SendingSetupCard />
        <DynamicList viewName={viewName} />
      </div>
    );
  }
  if (viewName === 'x:Directory') {
    return (
      <div className="space-y-4">
        <DirectorySetupCard />
        <DynamicList viewName={viewName} />
      </div>
    );
  }
  if (viewName === 'x:MtaInboundThrottle' || viewName === 'x:MtaOutboundThrottle' || viewName === 'x:MtaQueueQuota') {
    return (
      <div className="space-y-4">
        <LimitsSummary object={viewName} />
        <DynamicList viewName={viewName} />
      </div>
    );
  }
  if (viewName === 'x:Alert') {
    return <AlertsPage viewName={viewName} />;
  }
  if (viewName === 'x:NetworkListener') {
    return <ListenersPage viewName={viewName} />;
  }
  if (viewName === 'x:WebHook') {
    return <WebhooksPage viewName={viewName} />;
  }
  return <DynamicList viewName={viewName} />;
}
