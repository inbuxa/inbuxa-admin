/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Metric } from '../types/metrics';
import { weeklyGrid } from '../rhythm';

/**
 * The server's weekly rhythm: one square per hour of the week, darker the
 * more mail moved through it. Busy mornings, quiet weekends and a 3 a.m.
 * spike that shouldn't be there all show at a glance. Hidden until
 * monitoring has recorded something.
 */
export function WeeklyHeatmap({ samples }: { samples: Metric[] }) {
  const { t, i18n } = useTranslation();
  const grid = useMemo(() => weeklyGrid(samples), [samples]);
  const max = Math.max(...grid.flat());
  const days = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(i18n.language, { weekday: 'short' });
    // 2024-01-01 was a Monday.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [i18n.language]);

  if (max <= 0) return null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('rhythm.title', 'Your mail’s weekly rhythm')}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('rhythm.subtitle', 'Messages handled by hour and day, over the period above')}
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="grid min-w-[560px] grid-cols-[2.5rem_repeat(24,minmax(0,1fr))] gap-1">
            {grid.map((row, d) => (
              <div key={d} className="contents">
                <span className="self-center text-xs text-muted-foreground">{days[d]}</span>
                {row.map((v, h) => (
                  <span
                    key={h}
                    title={t('rhythm.cell', '{{day}} {{hour}}:00, {{count}} messages', {
                      day: days[d],
                      hour: String(h).padStart(2, '0'),
                      count: v,
                    })}
                    className="aspect-square rounded-[3px] bg-[var(--chart-1)] transition-transform hover:scale-125"
                    style={{ opacity: v === 0 ? 0.08 : 0.2 + 0.8 * (v / max) }}
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
      </CardContent>
    </Card>
  );
}
