/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { formatValue } from '../helpers';
import { Panel } from './Panel';

interface MailFlowProps {
  received: number[];
  sent: number[];
  /** When each slice starts, for its hover text. */
  times: Date[];
  periodLabel: string;
}

/**
 * Mail in and out over the period, mirrored across one line: arrivals rise
 * above it, departures hang below. Lopsided traffic, a quiet stretch or a
 * burst of outbound mail shows in its shape.
 */
export function MailFlow({ received, sent, times, periodLabel }: MailFlowProps) {
  const { t, i18n } = useTranslation();
  // One scale for both directions, with the axis where the data puts it:
  // arrivals get the room their busiest slice needs, departures theirs.
  const maxIn = Math.max(0, ...received);
  const maxOut = Math.max(0, ...sent);
  const span = maxIn + maxOut || 1;
  const axis = maxIn + maxOut ? (maxIn / span) * 100 : 50;
  const inTotal = received.reduce((s, v) => s + v, 0);
  const outTotal = sent.reduce((s, v) => s + v, 0);
  const fmt = new Intl.DateTimeFormat(i18n.language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Panel
      title={t('cc.flow', 'Mail flow')}
      aside={
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{periodLabel}</span>
      }
      href="/Management/x:Trace/InboundDelivery"
      hrefLabel={t('cc.traces', 'Traces')}
    >
      <div className="mb-3 flex gap-6">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            ▲ {t('cc.in', 'In')}
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums text-primary">
            {formatValue(inTotal, 'number')}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            ▼ {t('cc.out', 'Out')}
          </div>
          <div className="font-mono text-xl font-semibold tabular-nums text-[var(--chart-3)]">
            {formatValue(outTotal, 'number')}
          </div>
        </div>
      </div>
      <div
        className="relative min-h-36 flex-1"
        role="img"
        aria-label={t('cc.flowAria', '{{in}} messages in, {{out}} out', { in: inTotal, out: outTotal })}
      >
        <div className="absolute inset-x-0 h-px bg-border" style={{ top: `${axis}%` }} />
        <div className="absolute inset-0 flex gap-[2px]">
          {received.map((r, i) => (
            <div
              key={i}
              className="group relative flex flex-1 flex-col"
              title={t('cc.flowSlice', '{{time}} · {{in}} in, {{out}} out', {
                time: times[i] ? fmt.format(times[i]) : '',
                in: r,
                out: sent[i] ?? 0,
              })}
            >
              <div className="flex items-end" style={{ height: `${axis}%` }}>
                <span
                  className="w-full rounded-t-[2px] bg-primary/80 transition-[height] duration-500 group-hover:bg-primary"
                  style={{ height: `${maxIn ? (r / maxIn) * 100 : 0}%` }}
                />
              </div>
              <div className="flex items-start" style={{ height: `${100 - axis}%` }}>
                <span
                  className="w-full rounded-b-[2px] bg-[var(--chart-3)] opacity-75 transition-[height] duration-500 group-hover:opacity-100"
                  style={{ height: `${maxOut ? ((sent[i] ?? 0) / maxOut) * 100 : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}
