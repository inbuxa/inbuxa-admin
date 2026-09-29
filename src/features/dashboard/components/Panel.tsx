/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PanelProps {
  title: ReactNode;
  /** Something small on the right of the heading: a status, a count. */
  aside?: ReactNode;
  /** Where "more" leads, when there's a page behind the panel. */
  href?: string | null;
  hrefLabel?: string;
  className?: string;
  children: ReactNode;
}

const corner = 'pointer-events-none absolute h-2.5 w-2.5 border-primary/50';

/**
 * One instrument on the command center: a framed panel with bracketed
 * corners and a small-caps heading, like a console readout.
 */
export function Panel({ title, aside, href, hrefLabel, className, children }: PanelProps) {
  return (
    <section className={cn('relative flex flex-col rounded-xl border bg-card p-4 shadow-soft sm:p-5', className)}>
      <Corners />
      <header className="mb-4 flex items-center gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{title}</h2>
        <span className="h-px flex-1 bg-gradient-to-r from-border to-transparent" />
        {aside}
        {href && (
          <Link to={href} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {hrefLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** The bracketed corners that frame every instrument. */
export function Corners() {
  return (
    <>
      <span className={cn(corner, '-left-px -top-px rounded-tl-xl border-l-2 border-t-2')} />
      <span className={cn(corner, '-right-px -top-px rounded-tr-xl border-r-2 border-t-2')} />
      <span className={cn(corner, '-bottom-px -left-px rounded-bl-xl border-b-2 border-l-2')} />
      <span className={cn(corner, '-bottom-px -right-px rounded-br-xl border-b-2 border-r-2')} />
    </>
  );
}

/** The pulsing dot that says a panel is fed by the live stream. */
export function LiveDot({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em]',
        on ? 'text-primary' : 'text-muted-foreground/70',
      )}
    >
      <span className="relative flex h-2 w-2">
        {on && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />}
        <span
          className={cn('relative inline-flex h-2 w-2 rounded-full', on ? 'bg-primary' : 'bg-muted-foreground/40')}
        />
      </span>
      {label}
    </span>
  );
}
