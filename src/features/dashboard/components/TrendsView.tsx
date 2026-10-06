/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import type { Dashboard } from '../types/schema';
import { presetLabel } from '../types/metrics';
import { useLiveMetricsStore } from '../stores/liveMetricsStore';
import { collectHistoryMetricIds, collectLiveMetricIds, formatValue } from '../helpers';
import { hrefFor, linkForMetrics } from '../links';
import { DECK_METRICS, LATENCIES, LIVE_IDS, PROTOCOLS, series, summarize, zoneOf } from '../commandCenter';
import type { Tone } from '../tones';
import { LiveDot, Panel } from './Panel';
import { Readout } from './Readout';
import { TrendChart } from './TrendChart';
import { TrendDeck } from './TrendDeck';
import { useDashboardShared } from '../dashboardContext';
import { usePageHistory } from '../usePageHistory';

const STRIP = 24;

/**
 * A trend page behind the command center: Network, Security, Delivery,
 * Performance or Storage. A row of readouts for the page's figures, then
 * each of its trends as an instrument panel. The pages themselves, and what
 * they chart, come from the server's schema.
 */
export function TrendsView({ dashboard }: { dashboard: Dashboard }) {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  const subscribeLive = useLiveMetricsStore((s) => s.subscribe);
  const unsubscribeLive = useLiveMetricsStore((s) => s.unsubscribe);
  const { facts, live, liveValues } = useDashboardShared();

  const historyIds = useMemo(() => {
    const ids = collectHistoryMetricIds(dashboard.cards, dashboard.charts);
    for (const id of DECK_METRICS[dashboard.id] ?? []) ids.add(id);
    return ids;
  }, [dashboard]);
  // The shell's lamps and the network meters want the usual live figures too.
  const liveIds = useMemo(() => {
    const ids = collectLiveMetricIds(dashboard.cards);
    for (const id of LIVE_IDS) ids.add(id);
    return ids;
  }, [dashboard]);
  const { samples, window, period } = usePageHistory(dashboard.id, historyIds);

  useEffect(() => {
    subscribeLive(liveIds);
    return () => unsubscribeLive();
  }, [liveIds, subscribeLive, unsubscribeLive]);

  const deck = {
    id: dashboard.id,
    samples,
    window,
    period,
    live,
    liveValues,
    facts,
  };
  // Live counts the connection meters already show don't need a readout too,
  // nor do timings that already have a dial of their own.
  const metered = new Set(dashboard.id === 'network' ? PROTOCOLS.map((p) => p.metric) : []);
  const dialed = new Set(
    (DECK_METRICS[dashboard.id] ?? []).filter((m) => m === 'server.memory' || LATENCIES.some((l) => l.metric === m)),
  );
  const cards = (dashboard.cards ?? []).filter(
    (c) => !(c.source === 'live' && c.metrics.every((m) => metered.has(m))) && !c.metrics.every((m) => dialed.has(m)),
  );
  const periodName =
    period.kind === 'preset' ? presetLabel((k, d) => t(k, d), period.preset) : t('cc.customPeriod', 'Chosen period');
  const zoneWord = {
    good: t('cc.zone.good', 'fine'),
    fair: t('cc.zone.fair', 'fair'),
    slow: t('cc.zone.slow', 'slow'),
  };
  const zoneTone: Record<string, Tone> = { good: 'primary', fair: 'warn', slow: 'crit' };

  return (
    <div className="space-y-5">
      <TrendDeck {...deck} periodName={periodName} part="gauges" />

      {cards.length > 0 && (
        <Panel
          title={dashboard.label}
          aside={
            cards.some((c) => c.source === 'live') ? (
              <LiveDot on={live} label={live ? t('cc.live', 'Live') : t('cc.offline', 'No feed')} />
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{periodName}</span>
            )
          }
        >
          <div className="flex flex-wrap gap-3 [&>*]:min-w-0 [&>*]:flex-[1_1_150px]">
            {cards.map((card, i) => {
              const link = linkForMetrics(card.metrics);
              const href = link && canViewObject(link.viewName) ? hrefFor(link) : null;
              const timing = card.format === 'duration';
              if (card.source === 'live') {
                const v = card.metrics.reduce<number | null>((s, id) => {
                  const m = liveValues.get(id);
                  return m === undefined ? s : (s ?? 0) + m;
                }, null);
                return (
                  <Readout
                    key={`${card.title}-${i}`}
                    label={card.title}
                    value={live && v !== null ? formatValue(v, card.format) : '—'}
                    detail={t('cc.now', 'now')}
                    href={href}
                  />
                );
              }
              const v = summarize(samples, card.metrics, timing);
              const known = timing ? LATENCIES.find((l) => card.metrics.includes(l.metric)) : undefined;
              const zone = v !== null && known ? zoneOf(v, known) : null;
              return (
                <Readout
                  key={`${card.title}-${i}`}
                  label={card.title}
                  value={v === null ? '—' : formatValue(v, card.format)}
                  detail={
                    zone ? (
                      <span className={cn(zone === 'fair' && 'text-highlight', zone === 'slow' && 'text-destructive')}>
                        {t('cc.avgZone', 'average · {{zone}}', { zone: zoneWord[zone] })}
                      </span>
                    ) : timing ? (
                      t('cc.average', 'average')
                    ) : (
                      periodName
                    )
                  }
                  bars={timing ? undefined : series(samples, card.metrics, window.from, window.to, STRIP)}
                  tone={zone ? zoneTone[zone] : 'primary'}
                  href={href}
                />
              );
            })}
          </div>
        </Panel>
      )}

      <TrendDeck {...deck} periodName={periodName} part="panels" />

      {dashboard.charts && dashboard.charts.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
          {dashboard.charts.map((chart, i, all) => (
            <TrendChart
              key={`${chart.title}-${i}`}
              // A last chart on its own takes the whole row rather than leave half of it empty.
              className={all.length % 2 && i === all.length - 1 ? 'lg:col-span-2' : undefined}
              chart={chart}
              samples={samples}
              window={window}
              period={period}
            />
          ))}
        </div>
      )}
    </div>
  );
}
