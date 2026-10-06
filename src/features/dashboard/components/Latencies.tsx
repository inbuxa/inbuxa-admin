/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Metric } from '../types/metrics';
import { formatValue } from '../helpers';
import { LATENCIES, mean, zoneOf, type Zone } from '../commandCenter';
import { Panel } from './Panel';

const ZONE_BAR: Record<Zone, string> = {
  good: 'bg-primary shadow-[0_0_8px_-2px_var(--primary)]',
  fair: 'bg-highlight shadow-[0_0_8px_-2px_var(--highlight)]',
  slow: 'bg-destructive shadow-[0_0_8px_-2px_var(--destructive)]',
};

/**
 * How long the server's work takes, averaged over the period: one meter per
 * stage, from taking a message in to writing it to disk. The track is marked
 * where fine turns fair and fair turns slow, so a creeping store or a DNS
 * resolver in trouble stands out without reading a single number.
 */
export function Latencies({ samples }: { samples: Metric[] }) {
  const { t } = useTranslation();
  const labels: Record<string, string> = {
    ingest: t('cc.lat.ingest', 'Take in'),
    index: t('cc.lat.index', 'Index'),
    dns: t('cc.lat.dns', 'DNS lookup'),
    delivery: t('cc.lat.delivery', 'Delivery attempt'),
    dataRead: t('cc.lat.dataRead', 'Data read'),
    dataWrite: t('cc.lat.dataWrite', 'Data write'),
    blobRead: t('cc.lat.blobRead', 'Blob read'),
    blobWrite: t('cc.lat.blobWrite', 'Blob write'),
  };

  return (
    <Panel title={t('cc.latency', 'Response times')} href="/Management/x:Log" hrefLabel={t('cc.logs', 'Logs')}>
      <ul className="flex flex-1 flex-col justify-between gap-2.5">
        {LATENCIES.map((l) => {
          const ms = mean(samples, [l.metric]);
          const full = l.bad * 2;
          const zone = ms === null ? null : zoneOf(ms, l);
          return (
            <li key={l.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-xs">
              <span className="truncate text-muted-foreground">{labels[l.id]}</span>
              <span className="relative h-2 rounded-full bg-muted" aria-hidden>
                <span
                  className="absolute inset-y-[-3px] w-px bg-highlight/70"
                  style={{ left: `${(l.good / full) * 100}%` }}
                />
                <span
                  className="absolute inset-y-[-3px] w-px bg-destructive/70"
                  style={{ left: `${(l.bad / full) * 100}%` }}
                />
                {ms !== null && zone && (
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 rounded-full transition-[width] duration-700',
                      ZONE_BAR[zone],
                    )}
                    style={{ width: `${Math.max(3, Math.min(100, (ms / full) * 100))}%` }}
                  />
                )}
              </span>
              <span
                className={cn(
                  'text-right font-mono font-semibold tabular-nums',
                  ms === null && 'font-normal text-muted-foreground/60',
                  zone === 'fair' && 'text-highlight',
                  zone === 'slow' && 'text-destructive',
                )}
              >
                {ms === null ? '—' : formatValue(ms, 'duration')}
              </span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
