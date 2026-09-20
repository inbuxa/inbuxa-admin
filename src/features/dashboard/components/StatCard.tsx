/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { IconTile } from '@/components/common/IconTile';
import { useMemo } from 'react';
import { ArrowUpRight, Info } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { hrefFor, useDashLink } from '../links';
import { LineChart, Line } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { Card as CardSchema } from '../types/schema';
import type { Metric } from '../types/metrics';
import { cardValue, formatValue, sparklineData, computeDelta } from '../helpers';
import { useLiveMetricsStore } from '../stores/liveMetricsStore';
import { getChartColor } from '@/components/ui/chart';

interface StatCardProps {
  card: CardSchema;
  historySamples: Metric[];
  historyWindow: { from: Date; to: Date };
  /** INBUXA: a value counted from the server's objects, used when live metrics aren't available. */
  fallback?: number;
}

export function StatCard({ card, historySamples, historyWindow, fallback }: StatCardProps) {
  const liveSnapshot = useLiveMetricsStore((s) => s.snapshot);
  const liveStatus = useLiveMetricsStore((s) => s.status);
  const link = useDashLink(card.metrics);

  const value = useMemo(() => {
    if (card.source === 'live' && fallback !== undefined && liveStatus !== 'open') return fallback;
    if (card.source === 'live') {
      const liveSamples = card.metrics.map((id) => liveSnapshot.get(id)).filter((m): m is Metric => m !== undefined);
      return cardValue(card, liveSamples);
    }
    return cardValue(card, historySamples);
  }, [card, liveSnapshot, historySamples, fallback, liveStatus]);

  // INBUXA: a live number the server can't report yet reads as unknown, not as zero.
  const unknown = card.source === 'live' && liveStatus !== 'open' && fallback === undefined;
  const formattedValue = unknown ? '—' : formatValue(value, card.format);

  const { from, to } = historyWindow;

  const sparkline = useMemo(() => {
    if (card.source !== 'history' || !card.sparkline) return null;
    return sparklineData(card, historySamples, from, to).map((v, i) => ({
      v,
      i,
    }));
  }, [card, historySamples, from, to]);

  const delta = useMemo(() => {
    if (card.source !== 'history' || !card.delta) return null;
    return computeDelta(card, historySamples, from, to);
  }, [card, historySamples, from, to]);

  const body = (
    <Card
      className={cn(
        'h-full transition-all hover:shadow-md',
        link &&
          'group-hover:-translate-y-0.5 group-hover:border-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring',
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <IconTile name={card.icon} size="sm" />
          <span className="text-sm font-medium text-muted-foreground">{card.title}</span>
          {link && (
            <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-primary" />
          )}
          {card.description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs">{card.description}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        <div className="mt-3 font-display text-3xl font-semibold tracking-tight">{formattedValue}</div>

        {(delta || sparkline) && (
          <div className="mt-1 flex items-center gap-2">
            {delta && (
              <Badge variant="secondary" className="text-xs font-normal text-muted-foreground">
                {delta.direction === 'up'
                  ? `\u2191 ${Math.abs(delta.pct)}%`
                  : delta.direction === 'down'
                    ? `\u2193 ${Math.abs(delta.pct)}%`
                    : '\u2013'}
              </Badge>
            )}
            {sparkline && (
              <LineChart width={64} height={32} data={sparkline}>
                <Line
                  type="monotone"
                  dataKey="v"
                  stroke={getChartColor(0)}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return link ? (
    <Link
      to={hrefFor(link)}
      className="group block focus-visible:outline-none"
      aria-label={`${card.title}: ${link.label}`}
    >
      {body}
    </Link>
  ) : (
    body
  );
}
