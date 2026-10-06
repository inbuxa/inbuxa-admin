/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { LEGACY_PROTOCOLS_VIEW } from '@/features/hardening/LegacyProtocolsBanner';
import { useLegacyProtocolsOff } from '@/features/hardening/useLegacyProtocolsOff';
import { useCriticalCount } from '@/features/security/useCriticalCount';
import { useDeliverabilityAlarms } from '@/features/deliverability/useDeliverabilityAlarms';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Dashboard } from '../types/schema';
import type { Metric } from '../types/metrics';
import { useDashboardStore } from '../stores/dashboardStore';
import { useLiveMetricsStore } from '../stores/liveMetricsStore';
import { useHistoryMetricsStore } from '../stores/historyMetricsStore';
import { deltaHistograms, periodKey } from '../helpers';
import { hrefFor, linkForMetrics } from '../links';
import { useServerFacts } from '../serverFacts';
import { useClusterState } from '../clusterHealth';
import { COMMAND_CACHE, HISTORY_IDS } from '../commandCenter';
import { buildAttention } from '../attention';
import { DashboardContext, type DashboardShared } from '../dashboardContext';
import { Greeting } from './Greeting';
import { Chip, Clock, DashNav, PeriodSwitch } from './BridgeControls';
import { AttentionRail } from './AttentionRail';
import { LiveDot } from './Panel';

/**
 * What every dashboard page shares, and keeps while you move between them:
 * the dashboards' navigation, the greeting band with its status lamps,
 * period, refresh and clock, and what needs a look. It fetches the server's
 * facts, the cluster's leases and the command center's metrics once, and
 * hands them to the page inside.
 */
export function DashboardShell({
  dashboards,
  current,
  section,
  children,
}: {
  dashboards: Dashboard[];
  current: string;
  section: string;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  const period = useDashboardStore((s) => s.period);
  const tick = useDashboardStore((s) => s.tick);
  const fetchHistory = useHistoryMetricsStore((s) => s.fetch);
  const refreshHistory = useHistoryMetricsStore((s) => s.refresh);
  const historyCache = useHistoryMetricsStore((s) => s.cache);
  const historyStatus = useHistoryMetricsStore((s) => s.status);
  const liveStatus = useLiveMetricsStore((s) => s.status);
  const liveSnapshot = useLiveMetricsStore((s) => s.snapshot);
  const facts = useServerFacts(tick).facts;
  const cluster = useClusterState(tick);
  const critical = useCriticalCount();
  // inbuxa: DL-18
  const deliverability = useDeliverabilityAlarms(tick);
  const deliverabilitySection = useSchemaStore((s) => s.viewToSection['CustomComponent/Deliverability']);
  const legacyOff = useLegacyProtocolsOff();

  const cacheKey = `${COMMAND_CACHE}|${periodKey(period)}`;
  const [version, setVersion] = useState(0);
  const [updated, setUpdated] = useState<Date | null>(null);

  // The command center's metrics: its dials, and the attention rail everywhere.
  useEffect(() => {
    let cancelled = false;
    const load = tick ? refreshHistory : fetchHistory;
    load(COMMAND_CACHE, period, HISTORY_IDS).then(() => {
      if (cancelled) return;
      setVersion((v) => v + 1);
      setUpdated(new Date());
    });
    return () => {
      cancelled = true;
    };
  }, [period, tick, fetchHistory, refreshHistory]);

  const samples = useMemo<Metric[]>(() => {
    void version;
    return deltaHistograms(historyCache.get(cacheKey)?.metrics ?? []);
  }, [historyCache, cacheKey, version]);

  const live = liveStatus === 'open';
  const liveValues = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, s] of liveSnapshot) m.set(id, s.count);
    return m;
  }, [liveSnapshot]);

  const health = cluster?.health ?? null;
  const attention = buildAttention({
    t,
    may: canViewObject,
    facts,
    health,
    critical,
    deliverability,
    deliverabilityHref: deliverabilitySection ? `/${deliverabilitySection}/CustomComponent/Deliverability` : null,
    samples,
    liveStatus,
    nodesHref: health ? `/${section}/Dashboard/cluster` : null,
    slowHref: dashboards.some((d) => d.id === 'performance') ? `/${section}/Dashboard/performance` : null,
    linkOf: (metrics) => {
      const l = linkForMetrics(metrics);
      return l && canViewObject(l.viewName) ? hrefFor(l) : null;
    },
  });

  const shared: DashboardShared = { facts, cluster, samples, live, liveValues, tick };
  const loading = [...historyStatus.entries()].some(([k, v]) => v === 'loading' && k.endsWith(periodKey(period)));

  return (
    <div className="space-y-5">
      <DashNav dashboards={dashboards} current={current} section={section} cluster={!!cluster} />
      <Greeting>
        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
          <LiveDot on={live} label={live ? t('cc.live', 'Live') : t('cc.offline', 'No feed')} />
          {health && (
            <Link to={`/${section}/Dashboard/cluster`}>
              <Chip tone={health.unhealthy ? 'muted' : 'ok'}>
                {t('cc.nodesChip', '{{up}}/{{all}} nodes', {
                  up: health.healthy,
                  all: health.healthy + health.unhealthy,
                })}
              </Chip>
            </Link>
          )}
          {legacyOff && (
            <Link
              to={`/Settings/${LEGACY_PROTOCOLS_VIEW}`}
              title={t('cc.legacyTitle', 'Only inbuxa webmail and JMAP apps can sign in.')}
            >
              <Chip tone="ok">
                <ShieldCheck className="h-3 w-3" />
                {t('cc.legacyOff', 'Legacy off')}
              </Chip>
            </Link>
          )}
          <PeriodSwitch loading={loading} />
          <Clock updated={updated} />
        </div>
      </Greeting>
      <AttentionRail items={attention} />
      <DashboardContext.Provider value={shared}>{children}</DashboardContext.Provider>
    </div>
  );
}
