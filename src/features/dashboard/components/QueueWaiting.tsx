/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, PartyPopper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Corners } from './Panel';
import type { WaitingDomain } from '../serverFacts';

const MAX_ROWS = 8;

/**
 * Where outgoing mail is waiting, by the domain it's going to: a bar per
 * destination, split into waiting its turn, retrying after a refusal, and
 * given up on. A stuck provider stands out at a glance. A click opens the
 * queue filtered to that destination.
 */
export function QueueWaiting({ waiting }: { waiting: WaitingDomain[] }) {
  const { t } = useTranslation();
  const rows = waiting.slice(0, MAX_ROWS);
  const max = Math.max(1, ...rows.map((r) => r.scheduled + r.retrying + r.failed));
  const sum = (k: 'scheduled' | 'retrying' | 'failed') => waiting.reduce((s, w) => s + w[k], 0);
  const legend = [
    { cls: 'bg-[var(--chart-1)]', label: t('queue.scheduled', 'Waiting its turn'), total: sum('scheduled') },
    { cls: 'bg-amber-500', label: t('queue.retrying', 'Retrying'), total: sum('retrying') },
    { cls: 'bg-rose-500', label: t('queue.failed', 'Gave up'), total: sum('failed') },
  ];

  return (
    <Card className="relative flex h-full flex-col">
      <Corners />
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div>
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('queue.title', 'Where mail is waiting')}
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('queue.subtitle', 'Outgoing recipients still in the queue, by destination')}
          </p>
        </div>
        <Link
          to="/Management/x:QueuedMessage"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('queue.open', 'Open the queue')}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {rows.length === 0 ? (
          <div className="flex min-h-[160px] flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
            <PartyPopper className="h-6 w-6 text-emerald-500" />
            {t('queue.empty', 'Nothing waiting. Everything has gone out.')}
          </div>
        ) : (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col justify-evenly gap-2.5">
              {rows.map((r) => {
                const total = r.scheduled + r.retrying + r.failed;
                const seg = (n: number) => `${(n / max) * 100}%`;
                return (
                  <Link
                    key={r.domain}
                    to={`/Management/x:QueuedMessage?f.to=${encodeURIComponent(r.domain)}`}
                    className="group grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm"
                    title={t('queue.rowTitle', '{{domain}}: {{s}} waiting, {{r}} retrying, {{f}} gave up', {
                      domain: r.domain,
                      s: r.scheduled,
                      r: r.retrying,
                      f: r.failed,
                    })}
                  >
                    <span className="truncate font-mono text-xs group-hover:text-primary">{r.domain}</span>
                    <span className="flex h-3 overflow-hidden rounded-full bg-muted">
                      <span className="h-full bg-[var(--chart-1)] transition-all" style={{ width: seg(r.scheduled) }} />
                      <span className="h-full bg-amber-500 transition-all" style={{ width: seg(r.retrying) }} />
                      <span className="h-full bg-rose-500 transition-all" style={{ width: seg(r.failed) }} />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{total}</span>
                  </Link>
                );
              })}
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-3">
              {legend.map((l) => (
                <div key={l.label}>
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    <span className={`h-2 w-2 rounded-full ${l.cls}`} />
                    <span className="truncate">{l.label}</span>
                  </div>
                  <div className="mt-1 font-mono text-lg font-semibold tabular-nums">{l.total}</div>
                </div>
              ))}
            </div>
            {waiting.length > MAX_ROWS && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t('queue.more', '+{{count}} more destinations', { count: waiting.length - MAX_ROWS })}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
