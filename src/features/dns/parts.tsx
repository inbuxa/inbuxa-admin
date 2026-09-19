/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LiveState } from './liveCheck';

/** One record's state in public DNS, as an icon. */
export function StateIcon({ state }: { state?: LiveState }) {
  switch (state) {
    case 'live':
      return <CheckCircle2 className="h-4 w-4 text-emerald-500 animate-in zoom-in" />;
    case 'different':
      return <AlertTriangle className="h-4 w-4 text-highlight" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'missing':
      return <CircleDashed className="h-4 w-4 text-muted-foreground" />;
    default:
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
}

/** How many of the records are live, as a ring that fills. */
export function ProgressRing({ pct, done }: { pct: number; done: boolean }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 72 72" className="h-20 w-20 shrink-0 -rotate-90" role="img" aria-label={`${pct}%`}>
      <circle cx="36" cy="36" r={r} fill="none" strokeWidth="7" className="stroke-muted" />
      <circle
        cx="36"
        cy="36"
        r={r}
        fill="none"
        strokeWidth="7"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c - (c * pct) / 100}
        className={cn('transition-[stroke-dashoffset] duration-700', done ? 'stroke-emerald-500' : 'stroke-primary')}
      />
      <text
        x="36"
        y="36"
        dominantBaseline="central"
        textAnchor="middle"
        className="rotate-90 fill-foreground text-[15px] font-semibold"
        style={{ transformOrigin: '36px 36px' }}
      >
        {pct}%
      </text>
    </svg>
  );
}
