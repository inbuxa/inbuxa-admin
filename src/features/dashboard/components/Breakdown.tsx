/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { formatValue } from '../helpers';
import { TONE_VAR, type Tone } from '../tones';
import { Panel } from './Panel';

export interface BreakdownRow {
  label: string;
  value: number;
  tone?: Tone;
}

/**
 * Totals side by side as glowing bars, longest first: what a whole was made
 * of over the period, readable at a glance.
 */
export function Breakdown({
  title,
  aside,
  rows,
  totalLabel,
}: {
  title: string;
  aside?: string;
  rows: BreakdownRow[];
  /** What the footer's total counts, e.g. "Stopped in all". */
  totalLabel: string;
}) {
  const sorted = [...rows].sort((a, b) => b.value - a.value);
  const max = Math.max(1, ...sorted.map((r) => r.value));
  const sum = sorted.reduce((s, r) => s + r.value, 0);
  return (
    <Panel
      title={title}
      aside={
        aside ? (
          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{aside}</span>
        ) : undefined
      }
    >
      <ul className="flex flex-1 flex-col justify-evenly gap-3">
        {sorted.map((r) => {
          const color = TONE_VAR[r.tone ?? 'primary'];
          return (
            <li key={r.label} className="grid grid-cols-[8rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-xs">
              <span className="truncate text-muted-foreground">{r.label}</span>
              <span className="h-2.5 rounded-full bg-muted">
                <span
                  className="block h-full rounded-full transition-[width] duration-700"
                  style={{
                    width: `${r.value ? Math.max(2, (r.value / max) * 100) : 0}%`,
                    background: color,
                    boxShadow: `0 0 8px -2px ${color}`,
                  }}
                />
              </span>
              <span className="text-right font-mono tabular-nums">
                <span className="font-semibold">{formatValue(r.value, 'number')}</span>
                <span className="ml-1.5 text-muted-foreground">
                  {sum ? `${Math.round((r.value / sum) * 100)}%` : ''}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 border-t pt-3">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" aria-hidden>
          {sorted.map((r) =>
            r.value ? (
              <span
                key={r.label}
                className="h-full transition-[width] duration-700"
                style={{
                  width: `${(r.value / (sum || 1)) * 100}%`,
                  background: TONE_VAR[r.tone ?? 'primary'],
                  opacity: 0.85,
                }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between text-xs text-muted-foreground">
          <span>{totalLabel}</span>
          <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
            {formatValue(sum, 'number')}
          </span>
        </div>
      </div>
    </Panel>
  );
}
