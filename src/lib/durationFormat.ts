/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Sizes and durations as people read them: the field widgets show a number
 * and a unit, and store bytes or milliseconds.
 */

type Scale = Record<string, number>;

const SIZE_SCALE = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 } satisfies Scale;
const DURATION_SCALE = { ms: 1, s: 1000, min: 60_000, h: 3_600_000, d: 86_400_000 } satisfies Scale;

export const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;
export const DURATION_UNITS = ['ms', 's', 'min', 'h', 'd'] as const;

/** The largest unit that keeps the number at 1 or more, to two decimals. */
function largestUnit(amount: number, scale: Scale, units: readonly string[]) {
  const unit = [...units].reverse().find((u) => amount / scale[u] >= 1);
  if (!unit) return { value: amount, unit: units[0] };
  return { value: Math.round((amount / scale[unit]) * 100) / 100, unit };
}

/** A number in a unit back to the base amount; an unknown unit leaves it as is. */
function fromUnit(value: number, unit: string, scale: Scale) {
  const factor = scale[unit];
  return factor === undefined ? value : Math.round(value * factor);
}

export const bytesToHuman = (bytes: number) => largestUnit(bytes, SIZE_SCALE, SIZE_UNITS);
export const humanToBytes = (value: number, unit: string) => fromUnit(value, unit, SIZE_SCALE);

/** "1.5 KB". */
export function formatSize(bytes: number): string {
  const { value, unit } = bytesToHuman(bytes);
  return `${value} ${unit}`;
}

export const msToHuman = (ms: number) => largestUnit(ms, DURATION_SCALE, DURATION_UNITS);
export const humanToMs = (value: number, unit: string) => fromUnit(value, unit, DURATION_SCALE);

const PARTS: [string, number][] = [
  ['d', DURATION_SCALE.d],
  ['h', DURATION_SCALE.h],
  ['m', DURATION_SCALE.min],
  ['s', DURATION_SCALE.s],
  ['ms', 1],
];

/** "1d 2h 3m", leaving out the parts that are zero; "0ms" for nothing. */
export function formatDuration(ms: number): string {
  if (ms === 0) return '0ms';
  let rest = ms;
  const out: string[] = [];
  for (const [label, size] of PARTS) {
    const n = size === 1 ? rest : Math.floor(rest / size);
    rest -= size === 1 ? n : n * size;
    if (n > 0) out.push(`${n}${label}`);
  }
  return out.join(' ');
}
