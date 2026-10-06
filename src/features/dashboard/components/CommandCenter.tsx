/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { usePermissions } from '@/hooks/usePermissions';
import { presetLabel } from '../types/metrics';
import { useDashboardStore } from '../stores/dashboardStore';
import { useLiveMetricsStore } from '../stores/liveMetricsStore';
import { bucketTimestamps, formatValue, getBucketCount, periodWindow } from '../helpers';
import { hrefFor, linkForMetrics } from '../links';
import { useDashboardShared } from '../dashboardContext';
import {
  AUTH_FAILED,
  BANS,
  HAM,
  LATENCIES,
  LIVE_IDS,
  RECEIVED,
  SENT,
  SPAM,
  load,
  mean,
  queueHealth,
  series,
  total,
  zoneOf,
} from '../commandCenter';
import { Gauge } from './Gauge';
import type { Tone } from '../tones';
import { Readout } from './Readout';
import { Panel } from './Panel';
import { LiveConnections } from './LiveConnections';
import { Latencies } from './Latencies';
import { MailFlow } from './MailFlow';
import { QueueWaiting } from './QueueWaiting';
import { StorageTreemap } from './StorageTreemap';
import { WeeklyHeatmap } from './WeeklyHeatmap';

const STRIP = 24;
const QUEUE = 'x:QueuedMessage';

function sliceLabel(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.round(h / 24)} d`;
}

const pct = (share: number) => `${Math.round(share * 100)}`;

/**
 * The first thing an administrator sees: a command center rather than a
 * page of charts. Under the shell's greeting and what needs a look, a row of
 * dials for the server's vital signs, quick stats with a strip of the period
 * behind each, live connection meters and response times, then where mail
 * is going and where the space is. Every figure opens the page where you'd
 * act on it.
 */
export function CommandCenter() {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  const period = useDashboardStore((s) => s.period);
  const subscribeLive = useLiveMetricsStore((s) => s.subscribe);
  const unsubscribeLive = useLiveMetricsStore((s) => s.unsubscribe);
  const { facts, cluster, samples, live, liveValues } = useDashboardShared();
  const health = cluster?.health ?? null;

  useEffect(() => {
    subscribeLive(LIVE_IDS);
    return () => unsubscribeLive();
  }, [subscribeLive, unsubscribeLive]);

  const liveValue = (id: string) => (live ? liveValues.get(id) : undefined);

  // The period in slices, for the flow strip and the load dial.
  const { from, to } = periodWindow(period);
  const buckets = getBucketCount(period);
  const received = series(samples, RECEIVED, from, to, buckets);
  const sent = series(samples, SENT, from, to, buckets);
  const times = bucketTimestamps(from, to, buckets);
  const flow = received.map((r, i) => r + (sent[i] ?? 0));
  const busy = load(flow);
  const strip = (ids: string[]) => series(samples, ids, from, to, STRIP);

  const spam = total(samples, SPAM);
  const scanned = spam + total(samples, HAM);
  const ingestMs = mean(samples, ['message-ingest.time']);
  const ingest = LATENCIES[0];
  const queueOk = queueHealth(facts?.waiting);
  const queued = liveValue('queue.count') ?? facts?.queued;
  const retrying = facts?.retrying ?? 0;
  const quotaAccounts = facts?.storage?.filter((a) => a.quota) ?? [];
  const quotaUsed = quotaAccounts.reduce((s, a) => s + a.used, 0);
  const quotaTotal = quotaAccounts.reduce((s, a) => s + (a.quota ?? 0), 0);
  const storedTotal = facts?.storage?.reduce((s, a) => s + a.used, 0);

  const periodName =
    period.kind === 'preset' ? presetLabel((k, d) => t(k, d), period.preset) : t('cc.customPeriod', 'Chosen period');

  const may = (view: string) => canViewObject(view);
  const linkOf = (metrics: string[]) => {
    const l = linkForMetrics(metrics);
    return l && may(l.viewName) ? hrefFor(l) : null;
  };

  const ingestZone = ingestMs === null ? null : zoneOf(ingestMs, ingest);
  const toneOfZone: Record<string, Tone> = { good: 'primary', fair: 'warn', slow: 'crit' };
  const queueTone: Tone = queueOk >= 0.9 ? 'ok' : queueOk >= 0.6 ? 'warn' : 'crit';
  const slice = sliceLabel((to.getTime() - from.getTime()) / buckets);

  return (
    <div className="space-y-5">
      {/* Vital signs */}
      <Panel
        title={t('cc.vitals', 'Vital signs')}
        aside={
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{periodName}</span>
        }
      >
        <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-[repeat(auto-fit,minmax(170px,1fr))]">
          <Gauge
            value={busy.peak > 0 ? busy.ratio : null}
            reading={formatValue(busy.now, 'number')}
            unit={t('cc.perSlice', '/{{slice}}', { slice })}
            label={t('cc.g.load', 'Load')}
            detail={
              busy.peak > 0
                ? t('cc.g.loadDetail', '{{pct}}% of peak ({{peak}})', {
                    pct: pct(busy.ratio),
                    peak: formatValue(busy.peak, 'number'),
                  })
                : t('cc.g.noTraffic', 'No mail recorded yet')
            }
          />
          <Gauge
            value={facts?.waiting ? queueOk : null}
            tone={queueTone}
            reading={facts?.waiting ? pct(queueOk) : '—'}
            unit="%"
            label={t('cc.g.queue', 'Queue on schedule')}
            detail={
              queued !== undefined
                ? t('cc.g.queueDetail', '{{n}} queued · {{r}} retrying', { n: queued, r: retrying })
                : undefined
            }
            bands={[
              { from: 0, to: 0.6, tone: 'crit' },
              { from: 0.6, to: 0.9, tone: 'warn' },
              { from: 0.9, to: 1, tone: 'ok' },
            ]}
          />
          <Gauge
            value={scanned ? 1 - spam / scanned : null}
            tone="primary"
            reverse={scanned ? { value: spam / scanned, tone: 'crit' } : undefined}
            reading={formatValue(total(samples, RECEIVED), 'number')}
            label={t('cc.g.received', 'Mail received')}
            detail={
              scanned ? (
                <span className="inline-flex flex-wrap justify-center gap-x-2">
                  <span className="text-primary">
                    {t('cc.g.clean', '{{n}} to inboxes', { n: formatValue(scanned - spam, 'number') })}
                  </span>
                  <span className="text-destructive">
                    {t('cc.g.filtered', '{{n}} spam filtered', { n: formatValue(spam, 'number') })}
                  </span>
                </span>
              ) : (
                t('cc.g.noScans', 'Nothing scanned yet')
              )
            }
          />
          <Gauge
            value={ingestMs === null ? null : ingestMs / (ingest.bad * 2)}
            tone={ingestZone ? toneOfZone[ingestZone] : 'primary'}
            reading={ingestMs === null ? '—' : formatValue(ingestMs, 'duration')}
            label={t('cc.g.ingest', 'Take-in time')}
            detail={t('cc.g.ingestDetail', 'Average per message')}
            bands={[
              { from: 0, to: ingest.good / (ingest.bad * 2), tone: 'primary' },
              { from: ingest.good / (ingest.bad * 2), to: 0.5, tone: 'warn' },
              { from: 0.5, to: 1, tone: 'crit' },
            ]}
          />
          {health && (
            <Gauge
              value={health.healthy / (health.healthy + health.unhealthy)}
              tone={health.unhealthy ? 'crit' : 'ok'}
              reading={
                <>
                  {health.healthy}
                  <span className="text-muted-foreground">/{health.healthy + health.unhealthy}</span>
                </>
              }
              label={t('cc.g.nodes', 'Nodes up')}
              detail={
                health.unhealthy
                  ? health.silent.map((n) => n.hostname).join(', ')
                  : t('cc.g.nodesDetail', 'Every node renewing')
              }
              tickEvery={1 / (health.healthy + health.unhealthy)}
            />
          )}
          {quotaTotal > 0 && (
            <Gauge
              value={quotaUsed / quotaTotal}
              tone={quotaUsed / quotaTotal >= 0.9 ? 'crit' : quotaUsed / quotaTotal >= 0.75 ? 'warn' : 'primary'}
              reading={pct(quotaUsed / quotaTotal)}
              unit="%"
              label={t('cc.g.storage', 'Quota used')}
              detail={t('cc.g.storageDetail', '{{used}} of {{quota}}', {
                used: formatValue(quotaUsed, 'bytes'),
                quota: formatValue(quotaTotal, 'bytes'),
              })}
            />
          )}
        </div>
      </Panel>

      {/* Quick stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        <Readout
          label={t('cc.r.users', 'People')}
          value={formatValue(liveValue('user.count') ?? facts?.users ?? 0, 'number')}
          detail={
            facts?.groups
              ? t('cc.r.groups', {
                  count: facts.groups,
                  defaultValue_one: '{{count}} group',
                  defaultValue_other: '{{count}} groups',
                })
              : undefined
          }
          href={linkOf(['user.count'])}
        />
        <Readout
          label={t('cc.r.domains', 'Domains')}
          value={formatValue(liveValue('domain.count') ?? facts?.domains ?? 0, 'number')}
          href={linkOf(['domain.count'])}
        />
        <Readout
          label={t('cc.r.received', 'Received')}
          value={formatValue(total(samples, RECEIVED), 'number')}
          bars={strip(RECEIVED)}
          href={linkOf(RECEIVED)}
        />
        <Readout
          label={t('cc.r.sent', 'Sent')}
          value={formatValue(total(samples, SENT), 'number')}
          bars={strip(SENT)}
          tone="neutral"
          href={linkOf(SENT)}
        />
        <Readout
          label={t('cc.r.queued', 'Queued')}
          value={queued === undefined ? '—' : formatValue(queued, 'number')}
          detail={retrying ? t('cc.r.retrying', '{{count}} retrying', { count: retrying }) : undefined}
          href={may(QUEUE) ? `/Management/${QUEUE}` : null}
        />
        <Readout
          label={t('cc.r.spam', 'Spam blocked')}
          value={formatValue(spam, 'number')}
          bars={strip(SPAM)}
          tone="neutral"
          href={linkOf(SPAM)}
        />
        <Readout
          label={t('cc.r.authFailed', 'Failed sign-ins')}
          value={formatValue(total(samples, AUTH_FAILED), 'number')}
          bars={strip(AUTH_FAILED)}
          tone="warn"
          href={linkOf(AUTH_FAILED)}
        />
        <Readout
          label={t('cc.r.bans', 'Addresses banned')}
          value={formatValue(total(samples, BANS), 'number')}
          detail={
            facts?.blockedIps !== undefined
              ? t('cc.r.blocked', '{{count}} on the block list', { count: facts.blockedIps })
              : undefined
          }
          bars={strip(BANS)}
          tone="crit"
          href={linkOf(BANS)}
        />
        <Readout
          label={t('cc.r.stored', 'Mail stored')}
          value={storedTotal === undefined ? '—' : formatValue(storedTotal, 'bytes')}
          detail={
            facts?.storage
              ? t('cc.r.storedDetail', {
                  count: facts.storage.length,
                  defaultValue_one: 'across {{count}} account',
                  defaultValue_other: 'across {{count}} accounts',
                })
              : undefined
          }
          href={may('x:Account/User') ? '/Management/x:Account/User' : null}
        />
        <Readout
          label={t('cc.r.memory', 'Memory')}
          value={liveValue('server.memory') === undefined ? '—' : formatValue(liveValue('server.memory') ?? 0, 'bytes')}
          detail={t('cc.r.memoryDetail', 'This node, now')}
        />
      </div>

      {/* Current state */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] [&>*]:min-w-0">
        <LiveConnections values={liveValues} live={live} />
        <Latencies samples={samples} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <MailFlow received={received} sent={sent} times={times} periodLabel={periodName} />
        <WeeklyHeatmap samples={samples} />
      </div>

      {facts && (facts.storage || facts.waiting) && (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          {facts.waiting && <QueueWaiting waiting={facts.waiting} />}
          {facts.storage && <StorageTreemap storage={facts.storage} />}
        </div>
      )}
    </div>
  );
}
