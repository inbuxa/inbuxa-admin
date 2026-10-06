/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { PROTOCOLS } from '../commandCenter';
import { Panel, LiveDot } from './Panel';

const SEGMENTS = 16;

/**
 * Who's connected right now, by protocol: a column of lit segments each,
 * like a level meter, scaled to the busiest. Fed by the live stream; when
 * that's down the meters go dark rather than show stale numbers.
 */
export function LiveConnections({ values, live }: { values: Map<string, number>; live: boolean }) {
  const { t } = useTranslation();
  // A fixed floor, then headroom over the busiest, so a handful of sessions
  // never reads as a full meter. The color is the protocol's, not a warning:
  // being the busiest isn't a fault.
  const busiest = Math.max(0, ...PROTOCOLS.map((p) => values.get(p.metric) ?? 0));
  const max = Math.max(25, Math.ceil((busiest * 1.25) / 5) * 5);
  const sum = PROTOCOLS.reduce((s, p) => s + (values.get(p.metric) ?? 0), 0);

  return (
    <Panel
      title={t('cc.connections', 'Connections now')}
      aside={<LiveDot on={live} label={live ? t('cc.live', 'Live') : t('cc.offline', 'No feed')} />}
    >
      <div className="flex flex-1 items-stretch justify-between gap-2">
        {PROTOCOLS.map((p) => {
          const v = live ? (values.get(p.metric) ?? 0) : null;
          const lit = v === null ? 0 : Math.ceil((v / max) * SEGMENTS);
          return (
            <div key={p.id} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
              <span className="font-mono text-sm font-semibold tabular-nums">{v ?? '—'}</span>
              <div className="flex min-h-[124px] w-full max-w-7 flex-1 flex-col-reverse gap-[3px]" aria-hidden>
                {Array.from({ length: SEGMENTS }, (_, i) => {
                  const on = i < lit;
                  return (
                    <span
                      key={i}
                      className={cn(
                        'min-h-[4px] flex-1 rounded-[1.5px] transition-colors duration-500',
                        !on && 'bg-muted',
                        on && 'bg-primary shadow-[0_0_6px_-1px_var(--primary)]',
                      )}
                    />
                  );
                })}
              </div>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {p.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex shrink-0 items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span>{t('cc.connectionsTotal', 'Open sessions')}</span>
        <span className="font-mono font-semibold tabular-nums text-foreground">{live ? sum : '—'}</span>
      </div>
    </Panel>
  );
}
