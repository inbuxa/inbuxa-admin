/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createElement } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Attention {
  id: string;
  severity: 'crit' | 'warn';
  icon: LucideIcon;
  /** The count that leads the tile; left out when the tile isn't about a number. */
  count?: number;
  title: string;
  detail: string;
  href?: string | null;
}

const ORDER = { crit: 0, warn: 1 };

/**
 * What needs a look, first thing on the page: one tile per matter, the
 * critical ones leading and red, the rest amber. Each tile opens where you'd
 * deal with it. With nothing to report the rail isn't drawn at all.
 */
export function AttentionRail({ items }: { items: Attention[] }) {
  const { t } = useTranslation();
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => ORDER[a.severity] - ORDER[b.severity]);
  const crit = items.filter((i) => i.severity === 'crit').length;

  return (
    <section aria-labelledby="cc-attention">
      <div className="mb-2 flex items-center gap-3">
        <span className="relative flex h-2.5 w-2.5">
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
              crit ? 'bg-destructive' : 'bg-highlight',
            )}
          />
          <span
            className={cn('relative inline-flex h-2.5 w-2.5 rounded-full', crit ? 'bg-destructive' : 'bg-highlight')}
          />
        </span>
        <h2 id="cc-attention" className="text-[11px] font-semibold uppercase tracking-[0.16em] text-foreground">
          {t('cc.attention', {
            count: items.length,
            defaultValue_one: 'Needs attention · {{count}}',
            defaultValue_other: 'Needs attention · {{count}}',
          })}
        </h2>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
      </div>
      <div className="flex flex-wrap gap-3 [&>*]:min-w-0 [&>*]:flex-[1_1_250px]">
        {sorted.map((a) => {
          const body = (
            <div
              className={cn(
                'group relative flex h-full items-start gap-3 overflow-hidden rounded-xl border bg-card p-4 pl-5 shadow-soft transition-all',
                a.severity === 'crit' ? 'border-destructive/50' : 'border-highlight/50',
                a.href && 'hover:-translate-y-0.5 hover:shadow-md',
              )}
            >
              <span
                className={cn(
                  'absolute inset-y-0 left-0 w-1',
                  a.severity === 'crit' ? 'bg-destructive' : 'bg-highlight',
                )}
              />
              <span
                className={cn(
                  'pointer-events-none absolute inset-0 opacity-[0.07]',
                  a.severity === 'crit'
                    ? 'bg-gradient-to-br from-destructive to-transparent'
                    : 'bg-gradient-to-br from-highlight to-transparent',
                )}
              />
              {createElement(a.icon, {
                className: cn('mt-0.5 h-5 w-5 shrink-0', a.severity === 'crit' ? 'text-destructive' : 'text-highlight'),
                'aria-hidden': true,
              })}
              <div className="relative min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  {a.count !== undefined && (
                    <span
                      className={cn(
                        'font-mono text-2xl font-semibold leading-none tabular-nums',
                        a.severity === 'crit' ? 'text-destructive' : 'text-highlight',
                      )}
                    >
                      {a.count}
                    </span>
                  )}
                  <span className="text-sm font-semibold leading-tight">{a.title}</span>
                </div>
                <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{a.detail}</p>
              </div>
              {a.href && (
                <ArrowRight className="relative mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
              )}
            </div>
          );
          return a.href ? (
            <Link
              key={a.id}
              to={a.href}
              className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl"
            >
              {body}
            </Link>
          ) : (
            <div key={a.id}>{body}</div>
          );
        })}
      </div>
    </section>
  );
}
