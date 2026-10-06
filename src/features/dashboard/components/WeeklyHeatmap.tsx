/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Corners } from './Panel';
import type { Metric } from '../types/metrics';
import { weeklyGrid } from '../rhythm';

/**
 * The server's weekly rhythm: one square per hour of the week, darker the
 * more mail moved through it. Busy mornings, quiet weekends and a 3 a.m.
 * spike that shouldn't be there all show at a glance. Hidden until
 * monitoring has recorded something.
 */
export function WeeklyHeatmap({
  samples,
  metrics,
  title,
  subtitle,
  color = 'var(--chart-1)',
}: {
  samples: Metric[];
  /** What to count; mail handled when left out. */
  metrics?: string[];
  title?: string;
  subtitle?: string;
  color?: string;
}) {
  const { t, i18n } = useTranslation();
  const grid = useMemo(() => weeklyGrid(samples, metrics), [samples, metrics]);
  const max = Math.max(...grid.flat());
  const days = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);

  if (max <= 0) return null;
  let peak = { d: 0, h: 0, v: 0 };
  grid.forEach((row, d) => row.forEach((v, h) => v > peak.v && (peak = { d, h, v })));
  const sum = grid.flat().reduce((a, b) => a + b, 0);

  return (
    <Card className="relative flex h-full flex-col">
      <Corners />
      <CardHeader className="pb-3">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {title ?? t('rhythm.title', 'Your mail’s weekly rhythm')}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {subtitle ?? t('rhythm.subtitle', 'Messages handled by hour and day, over the period above')}
        </p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div className="mb-3 overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1">
            {grid.map((row, d) => (
              <div key={d} className="contents">
                <span className="self-center text-xs text-muted-foreground">{days[d]}</span>
                {row.map((v, h) => (
                  <span
                    key={h}
                    title={
                      metrics
                        ? t('rhythm.cellCount', '{{day}} {{hour}}:00, {{count}}', {
                            day: days[d],
                            hour: String(h).padStart(2, '0'),
                            count: v,
                          })
                        : t('rhythm.cell', '{{day}} {{hour}}:00, {{count}} messages', {
                            day: days[d],
                            hour: String(h).padStart(2, '0'),
                            count: v,
                          })
                    }
                    className="aspect-square rounded-[3px] transition-transform hover:scale-125"
                    style={{ background: color, opacity: v === 0 ? 0.08 : 0.2 + 0.8 * (v / max) }}
                  />
                ))}
              </div>
            ))}
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center text-[10px] text-muted-foreground">
                {h % 6 === 0 ? h : ''}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            {t('rhythm.less', 'Less')}
            {[0.08, 0.3, 0.55, 0.8, 1].map((o) => (
              <span key={o} className="h-2.5 w-2.5 rounded-[2px]" style={{ background: color, opacity: o }} />
            ))}
            {t('rhythm.more', 'More')}
          </span>
          <span>
            {t('rhythm.busiest', 'Busiest: {{day}} {{hour}}:00', {
              day: days[peak.d],
              hour: String(peak.h).padStart(2, '0'),
            })}{' '}
            <span className="font-mono font-semibold text-foreground tabular-nums">{peak.v}</span>
            {' · '}
            {t('rhythm.total', 'Total')}{' '}
            <span className="font-mono font-semibold text-foreground tabular-nums">{sum}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
