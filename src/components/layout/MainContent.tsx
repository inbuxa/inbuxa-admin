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
    if (resolved.objectName === 'x:Security') {
      return (
        <div className="space-y-4">
          <LegacyProtocolsBanner />
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
    return page;
  }

  return <DynamicList viewName={viewName} />;
}
