/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceDot,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Chart } from '../types/schema';
import type { Metric, Period } from '../types/metrics';
import {
  bucketTimestamps,
  bucketize,
  formatTimeTick,
  formatValue,
  getBucketCount,
  seriesBucketValue,
} from '../helpers';
import { LATENCIES, summarize } from '../commandCenter';
import { hrefFor, linkForMetrics } from '../links';
import { usePermissions } from '@/hooks/usePermissions';
import { Panel } from './Panel';

const COLORS = ['var(--primary)', 'var(--chart-3)', 'var(--highlight)', 'var(--destructive)', 'var(--chart-5)'];
const HEIGHT = 230;
const AXIS = { fontSize: 10, fontFamily: 'ui-monospace, monospace', fill: 'var(--muted-foreground)' };

function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

interface TrendChartProps {
  chart: Chart;
  samples: Metric[];
  window: { from: Date; to: Date };
  period: Period;
  className?: string;
}

/**
 * One trend over the period, framed like the command center's instruments.
 * Each series is a chip in the heading with its period total (or average,
 * for timings); counts glow as filled areas or columns, timings run as lines
 * over bands marking fine, fair and slow. The busiest moment is marked.
 */
export function TrendChart({ chart, samples, window: { from, to }, period, className }: TrendChartProps) {
  const { t } = useTranslation();
  const gid = useId().replace(/:/g, '');
  const { canViewObject } = usePermissions();
  const [ref, width] = useWidth();
  const format = chart.valueFormat ?? 'number';
  const timing = format === 'duration';
  const buckets = getBucketCount(period);

  const data = useMemo(() => {
    const slices = bucketize(samples, from, to, buckets);
    return bucketTimestamps(from, to, buckets).map((ts, i) => {
      const point: Record<string, number | string | null> = { tick: formatTimeTick(ts, period) };
      for (const s of chart.series) point[s.label] = seriesBucketValue(s, slices[i]) ?? (timing ? null : 0);
      return point;
    });
  }, [samples, from, to, buckets, chart.series, period, timing]);

  const summaries = chart.series.map((s) => summarize(samples, s.metrics, timing));

  // The busiest slice: of the first series, or of the whole stack when stacked.
  const peak = useMemo(() => {
    if (timing || chart.kind === 'bar' || chart.series.length === 0) return null;
    const keys = chart.stacked ? chart.series.map((s) => s.label) : [chart.series[0].label];
    let best: { tick: string; v: number } | null = null;
    for (const p of data) {
      const v = keys.reduce((sum, k) => sum + Number(p[k] ?? 0), 0);
      if (v > 0 && (!best || v > best.v)) best = { tick: String(p.tick), v };
    }
    return best;
  }, [data, chart.series, chart.stacked, chart.kind, timing]);

  // Timing charts over a stage we know get the fine / fair / slow bands.
  const zones = timing ? LATENCIES.find((l) => chart.series.some((s) => s.metrics.includes(l.metric))) : undefined;

  const link = linkForMetrics(chart.series.flatMap((s) => s.metrics));
  const href = link && canViewObject(link.viewName) ? hrefFor(link) : null;
  const fmt = (v: number) => formatValue(v, format);

  const common = { data, width, height: HEIGHT, margin: { top: 16, right: 24, left: 0, bottom: 0 } };
  const chrome = (
    <>
      <defs>
        {chart.series.map((s, i) => (
          <linearGradient key={s.label} id={`${gid}-${i}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.45} />
            <stop offset="100%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
          </linearGradient>
        ))}
      </defs>
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="tick" tick={AXIS} tickLine={false} axisLine={false} minTickGap={28} />
      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={56} tickFormatter={fmt} allowDecimals={timing} />
      {zones && (
        <>
          <ReferenceArea
            y1={zones.good}
            y2={zones.bad}
            fill="var(--highlight)"
            fillOpacity={0.06}
            ifOverflow="hidden"
          />
          <ReferenceArea
            y1={zones.bad}
            y2={zones.bad * 100}
            fill="var(--destructive)"
            fillOpacity={0.07}
            ifOverflow="hidden"
          />
        </>
      )}
      <Tooltip
        cursor={{ stroke: 'var(--primary)', strokeDasharray: '3 3' }}
        content={({ active, payload, label }) =>
          active && payload?.length ? (
            <div className="rounded-lg border bg-popover px-3 py-2 font-mono text-xs shadow-md">
              <div className="mb-1 text-muted-foreground">{label}</div>
              {payload.map((p) => (
                <div key={String(p.dataKey)} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                  <span className="text-muted-foreground">{String(p.dataKey)}</span>
                  <span className="ml-auto pl-4 font-semibold tabular-nums">
                    {p.value === null || p.value === undefined ? '—' : fmt(Number(p.value))}
                  </span>
                </div>
              ))}
            </div>
          ) : null
        }
      />
      {peak && (
        <ReferenceDot
          x={peak.tick}
          y={peak.v}
          r={4}
          fill="var(--card)"
          stroke="var(--primary)"
          strokeWidth={2}
          label={{
            value: t('cc.peak', 'PEAK'),
            position: 'top',
            fontSize: 9,
            fill: 'var(--muted-foreground)',
            fontFamily: 'ui-monospace, monospace',
          }}
        />
      )}
    </>
  );

  const series = chart.series.map((s, i) => {
    const color = COLORS[i % COLORS.length];
    if (chart.kind === 'bar')
      return (
        <Bar
          key={s.label}
          dataKey={s.label}
          fill={color}
          fillOpacity={0.85}
          radius={chart.stacked ? 0 : [3, 3, 0, 0]}
          stackId={chart.stacked ? 'a' : undefined}
          isAnimationActive={false}
        />
      );
    if (timing || chart.kind === 'line')
      return (
        <Line
          key={s.label}
          type="monotone"
          dataKey={s.label}
          stroke={color}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: 'var(--card)', stroke: color, strokeWidth: 2 }}
          connectNulls
          isAnimationActive={false}
        />
      );
    return (
      <Area
        key={s.label}
        type="monotone"
        dataKey={s.label}
        stroke={color}
        strokeWidth={2}
        fill={`url(#${gid}-${i})`}
        stackId={chart.stacked ? 'a' : undefined}
        activeDot={{ r: 4, fill: 'var(--card)', stroke: color, strokeWidth: 2 }}
        isAnimationActive={false}
      />
    );
  });

  const Kind = chart.kind === 'bar' ? BarChart : timing || chart.kind === 'line' ? LineChart : AreaChart;

  return (
    <Panel
      className={className}
      title={chart.title}
      href={href}
      hrefLabel={link ? t(`dashLink.${link.viewName}`, link.label) : undefined}
    >
      <div className="mb-3 flex flex-wrap gap-2">
        {chart.series.map((s, i) => (
          <span
            key={s.label}
            className="inline-flex items-center gap-2 rounded-md border bg-background/40 px-2.5 py-1 font-mono text-xs"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: COLORS[i % COLORS.length], boxShadow: `0 0 6px ${COLORS[i % COLORS.length]}` }}
            />
            <span className="uppercase tracking-wider text-muted-foreground">{s.label}</span>
            <span className="font-semibold tabular-nums">
              {summaries[i] === null ? '—' : fmt(summaries[i] as number)}
            </span>
            {timing && <span className="text-[10px] uppercase text-muted-foreground">{t('cc.avg', 'avg')}</span>}
          </span>
        ))}
        {chart.description && <span className="basis-full text-xs text-muted-foreground">{chart.description}</span>}
      </div>
      <div ref={ref} style={{ height: HEIGHT }}>
        {width > 0 && (
          <Kind {...common}>
            {chrome}
            {series}
          </Kind>
        )}
      </div>
    </Panel>
  );
}
