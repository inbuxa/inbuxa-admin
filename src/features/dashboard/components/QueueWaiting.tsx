/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, PartyPopper } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const legend = [
    { cls: 'bg-[var(--chart-1)]', label: t('queue.scheduled', 'Waiting its turn') },
    { cls: 'bg-amber-500', label: t('queue.retrying', 'Retrying') },
    { cls: 'bg-rose-500', label: t('queue.failed', 'Gave up') },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base">{t('queue.title', 'Where mail is waiting')}</CardTitle>
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
      <CardContent>
        {rows.length === 0 ? (
          <div className="flex h-[228px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
            <PartyPopper className="h-6 w-6 text-emerald-500" />
            {t('queue.empty', 'Nothing waiting. Everything has gone out.')}
          </div>
        ) : (
          <div className="space-y-2.5">
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
            <div className="flex flex-wrap gap-4 pt-2 text-xs text-muted-foreground">
              {legend.map((l) => (
                <span key={l.label} className="inline-flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${l.cls}`} />
                  {l.label}
                </span>
              ))}
              {waiting.length > MAX_ROWS &&
                t('queue.more', '+{{count}} more destinations', { count: waiting.length - MAX_ROWS })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
