/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useSchemaStore } from '@/stores/schemaStore';
import { presetLabel } from '../types/metrics';
import type { Chart } from '../types/schema';
import { useLiveMetricsStore } from '../stores/liveMetricsStore';
import { formatValue, getBucketCount } from '../helpers';
import {
  CLUSTER_IDS,
  CONNECTION_STARTS,
  COORDINATION,
  LIVE_IDS,
  STALE_AFTER_MS,
  STORE_ERRORS,
  THREAD_ERRORS,
  NODE_MAIL,
  cleanShare,
  nodeSeries,
  series,
  total,
} from '../commandCenter';
import type { ClusterNodeRow } from '../clusterHealth';
import { useDashboardShared } from '../dashboardContext';
import { usePageHistory } from '../usePageHistory';
import type { Tone } from '../tones';
import { Gauge } from './Gauge';
import { Panel } from './Panel';
import { BarStrip, Readout } from './Readout';
import { TrendChart } from './TrendChart';

const NODES_VIEW = 'x:ClusterNode';
const STRIP = 24;

/** Seconds since a lease was renewed, as of `now`; null if the time can't be read. */
function ageOf(n: ClusterNodeRow, now: number): number | null {
  const t = Date.parse(n.lastRenewal);
  return Number.isNaN(t) ? null : Math.max(0, now - t);
}

function ago(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 90) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}

/**
 * The cluster's own trends page, there only when this server is one node of
 * several. Dials for how many nodes are up, how fresh their heartbeats are,
 * and how much of the period the nodes' links and the shared data layer ran
 * without an error; a roster of every node with its heartbeat counting up
 * live; then the errors themselves over time.
 */
export function ClusterView() {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  const nodesSection = useSchemaStore((s) => s.viewToSection[NODES_VIEW]);
  const subscribeLive = useLiveMetricsStore((s) => s.subscribe);
  const unsubscribeLive = useLiveMetricsStore((s) => s.unsubscribe);
  const { cluster } = useDashboardShared();
  const { samples, window, period } = usePageHistory('cluster', CLUSTER_IDS);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    subscribeLive(LIVE_IDS);
    return () => unsubscribeLive();
  }, [subscribeLive, unsubscribeLive]);

  const buckets = getBucketCount(period);
  const coord = series(samples, COORDINATION, window.from, window.to, buckets);
  const store = series(samples, [...STORE_ERRORS, ...THREAD_ERRORS], window.from, window.to, buckets);
  const periodName =
    period.kind === 'preset' ? presetLabel((k, d) => t(k, d), period.preset) : t('cc.customPeriod', 'Chosen period');

  const charts = useMemo<Chart[]>(
    () => [
      {
        title: t('cc.c.coordination', 'Links between nodes'),
        kind: 'bar',
        stacked: true,
        description: t(
          'cc.c.coordinationDesc',
          'Errors and dropped links on the channel the nodes use to keep in step.',
        ),
        series: [
          { label: t('cc.c.subscriberErrors', 'receive errors'), metrics: ['cluster.subscriber-error'] },
          { label: t('cc.c.publisherErrors', 'send errors'), metrics: ['cluster.publisher-error'] },
          { label: t('cc.c.disconnects', 'dropped'), metrics: ['cluster.subscriber-disconnected'] },
        ],
      },
      {
        title: t('cc.c.dataLayer', 'Data layer errors'),
        kind: 'bar',
        stacked: true,
        description: t(
          'cc.c.dataLayerDesc',
          'Errors from the stores every node shares, and from the server’s own threads.',
        ),
        series: [
          { label: t('cc.c.storeErrors', 'store'), metrics: STORE_ERRORS },
          { label: t('cc.c.threadErrors', 'threads'), metrics: THREAD_ERRORS },
        ],
      },
    ],
    [t],
  );

  if (cluster === undefined) return null;
  if (cluster === null)
    return (
      <Panel title={t('cc.cluster', 'Cluster')}>
        <p className="text-sm text-muted-foreground">
          {t('cc.notCluster', 'This server runs on its own, so there is no cluster to show.')}
        </p>
      </Panel>
    );

  const { nodes, health } = cluster;
  const members = nodes.filter((n) => n.status !== 'inactive');
  const retired = nodes.filter((n) => n.status === 'inactive');
  const all = health.healthy + health.unhealthy;
  const activeAges = members
    .filter((n) => n.status === 'active')
    .map((n) => ageOf(n, now))
    .filter((a): a is number => a !== null);
  const oldest = activeAges.length ? Math.max(...activeAges) : null;
  const coordClean = cleanShare(coord);
  const storeClean = cleanShare(store);
  const cleanTone = (share: number): Tone => (share >= 0.99 ? 'ok' : share >= 0.95 ? 'warn' : 'crit');
  const cleanBands = [
    { from: 0, to: 0.95, tone: 'crit' as Tone },
    { from: 0.95, to: 0.99, tone: 'warn' as Tone },
    { from: 0.99, to: 1, tone: 'ok' as Tone },
  ];
  const nodesHref = nodesSection && canViewObject(NODES_VIEW) ? `/${nodesSection}/${NODES_VIEW}` : null;
  const n = (v: number) => formatValue(v, 'number');
  // inbuxa: each node's own traffic, from servers that say which node wrote a sample.
  const perNode = samples.some((m) => m.nodeId !== undefined);
  const nodeStrips = (nodeId: number) =>
    [
      { label: t('cc.nodeMail', 'Mail'), ids: NODE_MAIL },
      { label: t('cc.nodeConnections', 'Connections'), ids: CONNECTION_STARTS },
    ].map((row) => {
      const bars = nodeSeries(samples, nodeId, row.ids, window.from, window.to, STRIP);
      return { ...row, bars, total: bars.reduce((a, b) => a + b, 0) };
    });

  return (
    <div className="space-y-5">
      <Panel
        title={t('cc.instruments', 'Instruments')}
        aside={
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{periodName}</span>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          <Gauge
            value={health.healthy / all}
            tone={health.unhealthy ? 'crit' : 'ok'}
            reading={
              <>
                {health.healthy}
                <span className="text-muted-foreground">/{all}</span>
              </>
            }
            label={t('cc.g.nodes', 'Nodes up')}
            detail={
              health.unhealthy
                ? health.silent.map((s) => s.hostname).join(', ')
                : t('cc.g.nodesDetail', 'Every node renewing')
            }
            tickEvery={1 / all}
          />
          <Gauge
            value={oldest === null ? null : oldest / STALE_AFTER_MS}
            tone={
              oldest === null
                ? 'primary'
                : oldest < STALE_AFTER_MS / 2
                  ? 'primary'
                  : oldest < STALE_AFTER_MS * 0.83
                    ? 'warn'
                    : 'crit'
            }
            reading={oldest === null ? '—' : ago(oldest)}
            label={t('cc.g.heartbeat', 'Oldest heartbeat')}
            detail={t('cc.g.heartbeatDetail', 'Nodes renew every minute; stale after 3')}
            bands={[
              { from: 0, to: 0.5, tone: 'primary' },
              { from: 0.5, to: 0.83, tone: 'warn' },
              { from: 0.83, to: 1, tone: 'crit' },
            ]}
          />
          <Gauge
            value={coordClean}
            tone={cleanTone(coordClean)}
            reading={formatValue(coordClean * 100, 'percent')}
            label={t('cc.g.coordClean', 'Links clean')}
            detail={t('cc.g.errorsInPeriod', {
              count: total(samples, COORDINATION),
              defaultValue_one: '{{count}} error in the period',
              defaultValue_other: '{{count}} errors in the period',
            })}
            bands={cleanBands}
          />
          <Gauge
            value={storeClean}
            tone={cleanTone(storeClean)}
            reading={formatValue(storeClean * 100, 'percent')}
            label={t('cc.g.storeClean', 'Data layer clean')}
            detail={t('cc.g.errorsInPeriod', {
              count: total(samples, [...STORE_ERRORS, ...THREAD_ERRORS]),
              defaultValue_one: '{{count}} error in the period',
              defaultValue_other: '{{count}} errors in the period',
            })}
            bands={cleanBands}
          />
        </div>
      </Panel>

      <Panel
        title={t('cc.roster', 'Nodes')}
        href={nodesHref}
        hrefLabel={t('cc.rosterOpen', 'Node list')}
        aside={
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            {t('cc.rosterCount', '{{up}} of {{all}} up', { up: health.healthy, all })}
          </span>
        }
      >
        <div className="flex flex-wrap gap-3 [&>*]:min-w-0 [&>*]:flex-[1_1_220px]">
          {members.map((node) => {
            const age = ageOf(node, now);
            const up = node.status === 'active';
            const share = age === null ? 1 : Math.min(1, age / STALE_AFTER_MS);
            return (
              <div
                key={node.hostname}
                className={cn(
                  'relative overflow-hidden rounded-lg border bg-background/40 p-3.5',
                  !up && 'border-destructive/50',
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    {up && (
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-50" />
                    )}
                    <span
                      className={cn(
                        'relative inline-flex h-2.5 w-2.5 rounded-full',
                        up ? 'bg-primary' : 'bg-destructive',
                      )}
                    />
                  </span>
                  <span className="truncate font-mono text-sm font-semibold">{node.hostname}</span>
                  {node.nodeId !== undefined && (
                    <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {t('cc.nodeId', 'id {{id}}', { id: node.nodeId })}
                    </span>
                  )}
                </div>
                <div className="mt-2.5 flex items-baseline justify-between gap-2 whitespace-nowrap text-xs">
                  <span className={cn('uppercase tracking-wider', up ? 'text-muted-foreground' : 'text-destructive')}>
                    {up ? t('cc.nodeActive', 'Active') : t('cc.nodeSilent', 'Silent')}
                  </span>
                  <span className="font-mono tabular-nums">
                    {age === null ? '—' : t('cc.heartbeatAgo', 'heartbeat {{ago}} ago', { ago: ago(age) })}
                  </span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-muted" aria-hidden>
                  <div
                    className={cn(
                      'h-full rounded-full transition-[width] duration-1000 ease-linear',
                      !up ? 'bg-destructive' : share > 0.5 ? 'bg-highlight' : 'bg-primary',
                    )}
                    style={{ width: `${Math.max(2, share * 100)}%` }}
                  />
                </div>
                {perNode && node.nodeId !== undefined && (
                  <div className="mt-3 space-y-1.5 border-t pt-2.5">
                    {nodeStrips(Number(node.nodeId)).map((row) => (
                      <div key={row.label} className="grid grid-cols-[6.5rem_1fr] items-end gap-2">
                        <div className="flex items-baseline justify-between gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span className="truncate">{row.label}</span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {n(row.total)}
                          </span>
                        </div>
                        <BarStrip bars={row.bars} tone={up ? 'primary' : 'crit'} className="h-4" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {retired.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            {t('cc.retired', {
              count: retired.length,
              defaultValue_one: '{{count}} old lease not counted: {{names}}',
              defaultValue_other: '{{count}} old leases not counted: {{names}}',
              names: retired.map((r) => r.hostname).join(', '),
            })}
          </p>
        )}
      </Panel>

      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <Readout
          label={t('cc.r.receiveErrors', 'Receive errors')}
          value={n(total(samples, ['cluster.subscriber-error']))}
          bars={series(samples, ['cluster.subscriber-error'], window.from, window.to, STRIP)}
          tone="crit"
        />
        <Readout
          label={t('cc.r.sendErrors', 'Send errors')}
          value={n(total(samples, ['cluster.publisher-error']))}
          bars={series(samples, ['cluster.publisher-error'], window.from, window.to, STRIP)}
          tone="crit"
        />
        <Readout
          label={t('cc.r.drops', 'Dropped links')}
          value={n(total(samples, ['cluster.subscriber-disconnected']))}
          bars={series(samples, ['cluster.subscriber-disconnected'], window.from, window.to, STRIP)}
          tone="warn"
        />
        <Readout
          label={t('cc.r.storeErrors', 'Store errors')}
          value={n(total(samples, STORE_ERRORS))}
          bars={series(samples, STORE_ERRORS, window.from, window.to, STRIP)}
          tone="crit"
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        {charts.map((chart) => (
          <TrendChart key={chart.title} chart={chart} samples={samples} window={window} period={period} />
        ))}
      </div>
    </div>
  );
}
