/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { TONE_VAR, type Tone } from '../tones';

/** Where a colored band sits along the dial, as shares of full scale. */
export interface Band {
  from: number;
  to: number;
  tone: Tone;
}

interface GaugeProps {
  /** How far round the dial the needle is, 0–1; null draws the dial empty. */
  value: number | null;
  tone?: Tone;
  /** The big figure in the middle. */
  reading: ReactNode;
  unit?: ReactNode;
  label: ReactNode;
  /** A line of detail under the label. */
  detail?: ReactNode;
  bands?: Band[];
  /** Ticks on the dial, one per this share of full scale. */
  tickEvery?: number;
  /**
   * A second reading on an inner ring that runs backwards from the far end,
   * for a whole split in two: the main arc fills from the left, this one
   * from the right, and they meet where the split falls.
   */
  reverse?: { value: number; tone: Tone };
}

const SWEEP = 240;
const START = 90 + (360 - SWEEP) / 2; // clockwise from 3 o'clock, SVG angles
const R = 78;
const C = 100;

function point(angle: number, r: number) {
  const a = (angle * Math.PI) / 180;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function arc(from: number, to: number, r: number) {
  const a0 = START + SWEEP * from;
  const a1 = START + SWEEP * to;
  const [x0, y0] = point(a0, r);
  const [x1, y1] = point(a1, r);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/**
 * A dial in the manner of an instrument panel: a 240° track with tick marks,
 * optional colored bands for fine, fair and slow, and a glowing arc for the
 * reading. The figure itself sits in the middle, where the eye lands.
 */
export function Gauge({
  value,
  tone = 'primary',
  reading,
  unit,
  label,
  detail,
  bands,
  tickEvery = 0.1,
  reverse,
}: GaugeProps) {
  const glow = useId();
  const v = value === null ? 0 : Math.min(1, Math.max(0, value));
  const color = TONE_VAR[tone];
  const length = ((SWEEP / 360) * 2 * Math.PI * R).toFixed(1);
  const ticks = Math.round(1 / tickEvery);
  const needle = point(START + SWEEP * v, R);

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-full max-w-[220px]">
        <svg viewBox="0 0 200 172" className="w-full overflow-visible" aria-hidden>
          <defs>
            <filter id={glow} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* Scale ticks outside the track */}
          {Array.from({ length: ticks + 1 }, (_, i) => {
            const a = START + (SWEEP * i) / ticks;
            const major = i % 5 === 0;
            const [x0, y0] = point(a, R + 10);
            const [x1, y1] = point(a, R + (major ? 17 : 14));
            return (
              <line
                key={i}
                x1={x0}
                y1={y0}
                x2={x1}
                y2={y1}
                stroke="var(--muted-foreground)"
                strokeOpacity={major ? 0.7 : 0.35}
                strokeWidth={major ? 1.6 : 1}
                strokeLinecap="round"
              />
            );
          })}
          <path d={arc(0, 1, R)} fill="none" stroke="var(--muted)" strokeWidth={12} strokeLinecap="round" />
          {bands?.map((b, i) => (
            <path
              key={i}
              d={arc(b.from, b.to, R + 10)}
              fill="none"
              stroke={TONE_VAR[b.tone]}
              strokeOpacity={0.55}
              strokeWidth={2.5}
            />
          ))}
          {value !== null && (
            <>
              <path
                d={arc(0, 1, R)}
                fill="none"
                stroke={color}
                strokeWidth={12}
                strokeLinecap="round"
                strokeDasharray={length}
                strokeDashoffset={(1 - v) * Number(length)}
                filter={`url(#${glow})`}
                className="transition-[stroke-dashoffset] duration-700 ease-out"
              />
              <circle cx={needle[0]} cy={needle[1]} r={4.5} fill="var(--card)" stroke={color} strokeWidth={2.5} />
            </>
          )}
          {reverse && reverse.value > 0 && (
            <>
              <path
                d={arc(0, 1, R - 16)}
                fill="none"
                stroke="var(--muted)"
                strokeOpacity={0.6}
                strokeWidth={6}
                strokeLinecap="round"
              />
              <path
                d={arc(1 - Math.min(1, reverse.value), 1, R - 16)}
                fill="none"
                stroke={TONE_VAR[reverse.tone]}
                strokeWidth={6}
                strokeLinecap="round"
                filter={`url(#${glow})`}
              />
              <circle
                cx={point(START + SWEEP * (1 - Math.min(1, reverse.value)), R - 16)[0]}
                cy={point(START + SWEEP * (1 - Math.min(1, reverse.value)), R - 16)[1]}
                r={3.5}
                fill="var(--card)"
                stroke={TONE_VAR[reverse.tone]}
                strokeWidth={2}
              />
            </>
          )}
        </svg>
        <div className="absolute inset-x-0 top-[34%] flex flex-col items-center">
          <div className="flex items-baseline gap-1 font-mono text-[28px] font-semibold leading-none tabular-nums tracking-tight">
            {reading}
            {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
          </div>
        </div>
      </div>
      <div className="-mt-6 text-center">
        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
        {detail && <div className={cn('mt-1 text-xs text-muted-foreground/80')}>{detail}</div>}
      </div>
    </div>
  );
}
