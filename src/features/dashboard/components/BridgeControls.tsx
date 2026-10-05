/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Gauge as GaugeIcon, RefreshCw, X } from 'lucide-react';
import type { Dashboard } from '../types/schema';
import { cn } from '@/lib/utils';
import { AUTO_REFRESH, useDashboardStore, type AutoRefresh } from '../stores/dashboardStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PRESET_KEYS } from '../types/metrics';
import { startAutoRefresh } from '../autoRefresh';

/**
 * Local time to the second, with UTC beside it for comparing with logs, and
 * when the numbers on the page last came in; that line flashes as they do.
 */
export function Clock({ updated }: { updated?: Date | null }) {
  const { t, i18n } = useTranslation();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  const local = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);
  const utc = new Intl.DateTimeFormat(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(now);
  return (
    <div className="text-right font-mono leading-tight tabular-nums">
      <div className="text-lg font-semibold tracking-tight">{local}</div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">UTC {utc}</div>
      {updated && (
        <div
          key={updated.getTime()}
          className="animate-[cc-flash_1.2s_ease-out] text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
        >
          {t('cc.updated', 'Updated {{time}}', {
            time: new Intl.DateTimeFormat(i18n.language, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            }).format(updated),
          })}
        </div>
      )}
    </div>
  );
}

/**
 * 24H · 7D · 30D · 90D, as a row of keys; the one lit is the period every
 * panel reads. Beside it the refresh button and how often the page refreshes
 * by itself: off, or every 1, 5, 10 or 15 minutes (5 unless changed). The
 * choice is remembered, and shared by every dashboard page.
 */
export function PeriodSwitch({ loading = false }: { loading?: boolean }) {
  const { t } = useTranslation();
  const period = useDashboardStore((s) => s.period);
  const setPreset = useDashboardStore((s) => s.setPreset);
  const zoomedFrom = useDashboardStore((s) => s.zoomedFrom);
  const resetZoom = useDashboardStore((s) => s.resetZoom);
  const every = useDashboardStore((s) => s.autoRefresh);
  const setEvery = useDashboardStore((s) => s.setAutoRefresh);
  const onRefresh = useDashboardStore((s) => s.bump);
  const current = period.kind === 'preset' ? period.preset : null;

  useEffect(() => startAutoRefresh(every, onRefresh), [every, onRefresh]);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <div
        role="radiogroup"
        aria-label={t('cc.period', 'Period')}
        className="flex rounded-lg border bg-background/60 p-0.5 font-mono text-xs"
      >
        {PRESET_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={current === k}
            onClick={() => setPreset(k)}
            className={cn(
              'rounded-md px-2.5 py-1 font-semibold uppercase tracking-wider transition-colors',
              current === k
                ? 'bg-primary text-primary-foreground shadow-[0_0_12px_-3px_var(--primary)]'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {k}
          </button>
        ))}
      </div>
      {/* inbuxa: zoomed in from a chart, the window shown, and the way back. */}
      {zoomedFrom && period.kind === 'custom' && (
        <button
          type="button"
          onClick={resetZoom}
          title={t('cc.zoomReset', 'Back to {{period}}', {
            period: zoomedFrom.kind === 'preset' ? zoomedFrom.preset.toUpperCase() : '',
          })}
          className="inline-flex items-center gap-1.5 rounded-lg border border-primary/50 bg-primary/10 px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wider text-foreground transition-colors hover:bg-primary/20"
        >
          <span className="uppercase text-muted-foreground">{t('cc.zoomed', 'Zoom')}</span>
          {formatZoom(period.from, period.to)}
          <X className="h-3 w-3 text-muted-foreground" aria-hidden />
        </button>
      )}
      <div className="flex items-center rounded-lg border bg-background/60">
        <button
          type="button"
          onClick={onRefresh}
          aria-label={t('cc.refresh', 'Refresh')}
          title={t('cc.refresh', 'Refresh')}
          className="p-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
        <Select value={String(every)} onValueChange={(v) => setEvery(Number(v) as AutoRefresh)}>
          <SelectTrigger
            aria-label={t('cc.autoRefresh', 'Auto refresh')}
            className="h-7 w-auto gap-1 border-0 border-l bg-transparent px-2 font-mono text-[11px] font-semibold uppercase tracking-wider shadow-none focus:ring-0"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {AUTO_REFRESH.map((m) => (
              <SelectItem key={m} value={String(m)} className="font-mono text-xs">
                {m === 0 ? t('cc.autoOff', 'Auto off') : t('cc.autoEvery', 'Every {{m}}m', { m })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

/** A small status lamp for the header: a word or two and a colored dot. */
export function Chip({ tone, children }: { tone: 'ok' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.14em]',
        tone === 'ok' ? 'border-primary/30 text-primary' : 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  );
}

/**
 * The dashboards' own navigation, the same on every one of them: the command
 * center first, then each trend page, the current one lit.
 */
export function DashNav({
  dashboards,
  current,
  section,
  cluster = false,
}: {
  dashboards: Dashboard[];
  current: string;
  section: string;
  /** Adds the Cluster page, for servers that are one node of several. */
  cluster?: boolean;
}) {
  const { t } = useTranslation();
  const chip = (active: boolean) =>
    cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-mono text-[11px] font-semibold uppercase tracking-wider transition-colors',
      active
        ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_12px_-3px_var(--primary)]'
        : 'text-muted-foreground hover:border-primary/50 hover:text-foreground',
    );
  return (
    <nav aria-label={t('cc.dashboards', 'Dashboards')} className="flex flex-wrap items-center gap-2">
      <Link
        to={`/${section}/Dashboard/overview`}
        aria-current={current === 'overview' ? 'page' : undefined}
        className={chip(current === 'overview')}
      >
        <GaugeIcon className="h-3.5 w-3.5" />
        {t('cc.back', 'Command center')}
      </Link>
      <span className="mx-1 h-4 w-px bg-border" aria-hidden />
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t('cc.trends', 'Trends')}
      </span>
      {dashboards
        .filter((d) => d.id !== 'overview')
        .map((d) => (
          <Link
            key={d.id}
            to={`/${section}/Dashboard/${d.id}`}
            aria-current={d.id === current ? 'page' : undefined}
            className={chip(d.id === current)}
          >
            {d.label}
          </Link>
        ))}
      {cluster && (
        <Link
          to={`/${section}/Dashboard/cluster`}
          aria-current={current === 'cluster' ? 'page' : undefined}
          className={chip(current === 'cluster')}
        >
          {t('cc.cluster', 'Cluster')}
        </Link>
      )}
    </nav>
  );
}

/** inbuxa: a zoomed window, short: "5 Oct 14:00 – 17:00", or both dates when it spans days. */
function formatZoom(from: Date, to: Date): string {
  const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return day(from) === day(to)
    ? `${day(from)} ${time(from)} – ${time(to)}`
    : `${day(from)} ${time(from)} – ${day(to)} ${time(to)}`;
}
