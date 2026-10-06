/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Dashboard } from '../types/schema';
import { CommandCenter } from './CommandCenter';
import { ClusterView } from './ClusterView';
import { DashboardShell } from './DashboardShell';
import { TrendsView } from './TrendsView';

interface DashboardViewProps {
  dashboardId: string;
  section: string;
}

/**
 * INBUXA: every dashboard page sits in the same shell, which stays in place
 * as you move between them. The landing page is the command center; the
 * others are its trend pages, plus Cluster when the server is part of one.
 */
export function DashboardView({ dashboardId, section }: DashboardViewProps) {
  const navigate = useNavigate();
  const schema = useSchemaStore((s) => s.schema);
  const dashboards = useMemo<Dashboard[]>(() => schema?.dashboards ?? [], [schema]);
  const dashboard = dashboards.find((d) => d.id === dashboardId);
  const own = dashboardId === 'overview' || dashboardId === 'cluster';

  useEffect(() => {
    if (!own && !dashboard && dashboards.length > 0) {
      navigate(`/${section}/Dashboard/overview`, { replace: true });
    }
  }, [own, dashboard, dashboards, navigate, section]);

  return (
    <DashboardShell dashboards={dashboards} current={dashboardId} section={section}>
      {dashboardId === 'overview' ? (
        <CommandCenter />
      ) : dashboardId === 'cluster' ? (
        <ClusterView />
      ) : dashboard ? (
        <TrendsView key={dashboard.id} dashboard={dashboard} />
      ) : null}
    </DashboardShell>
  );
}
