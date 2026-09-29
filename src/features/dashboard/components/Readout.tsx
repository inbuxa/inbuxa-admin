/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { TONE_VAR, type Tone } from '../tones';

interface ReadoutProps {
  label: string;
  value: ReactNode;
  /** A few words of context: "last 24 hours", "3 near quota". */
  detail?: ReactNode;
  /** The period in slices, drawn as a strip of bars under the figure. */
  bars?: number[];
  tone?: Tone;
  href?: string | null;
}

/**
 * A quick stat: small-caps label, the figure in a fixed-width face, and a
 * strip of bars showing how it moved over the period.
 */
export function Readout({ label, value, detail, bars, tone = 'primary', href }: ReadoutProps) {
  const max = bars ? Math.max(1, ...bars) : 1;
  const body = (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg border bg-background/40 px-3.5 py-3 transition-colors',
        href && 'hover:border-primary/50 hover:bg-accent/30',
      )}
    >
      <div className="truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </div>
      <div className="mt-1.5 font-mono text-2xl font-semibold leading-none tabular-nums tracking-tight">{value}</div>
      {detail && <div className="mt-1 truncate text-[11px] text-muted-foreground">{detail}</div>}
      {bars && bars.length > 0 && (
        <div className="mt-auto flex h-5 items-end gap-px pt-2" aria-hidden>
          {bars.map((b, i) => (
            <span
              key={i}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${Math.max(8, (b / max) * 100)}%`,
                background: TONE_VAR[tone],
                opacity: b === 0 ? 0.15 : 0.35 + 0.65 * (b / max),
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
  return href ? (
    <Link
      to={href}
      className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
    >
      {body}
    </Link>
  ) : (
    body
  );
}
