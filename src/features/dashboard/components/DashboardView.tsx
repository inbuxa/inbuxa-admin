/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
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

/** Pages the console draws itself; every other id is one of the schema's trend dashboards. */
const BUILT_IN = new Set(['overview', 'cluster']);

/**
 * A dashboard page inside the shell they all share, which stays put while
 * moving between them. An id that names no dashboard goes to the overview.
 */
export function DashboardView({ dashboardId, section }: DashboardViewProps) {
  const navigate = useNavigate();
  const schema = useSchemaStore((s) => s.schema);
  const dashboards = useMemo<Dashboard[]>(() => schema?.dashboards ?? [], [schema]);
  const dashboard = dashboards.find((d) => d.id === dashboardId);
  const unknown = !BUILT_IN.has(dashboardId) && !dashboard && dashboards.length > 0;

  useEffect(() => {
    if (unknown) navigate(`/${section}/Dashboard/overview`, { replace: true });
  }, [unknown, navigate, section]);

  let page = null;
  if (dashboardId === 'overview') page = <CommandCenter />;
  else if (dashboardId === 'cluster') page = <ClusterView />;
  else if (dashboard) page = <TrendsView key={dashboard.id} dashboard={dashboard} />;

  return (
    <DashboardShell dashboards={dashboards} current={dashboardId} section={section}>
      {page}
    </DashboardShell>
  );
}
