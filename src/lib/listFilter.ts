/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Turns the filters a reader picked above a list into a JMAP `/query`
 * filter. A filter `size` with operator `sizeOp: 'gt'` becomes
 * `sizeIsGreaterThan`. Dates picked as a day become midnight UTC, and on x:
 * objects a plain day means the whole day.
 */
import type { Filter } from '@/types/schema';

const OPERATOR_SUFFIX: Record<string, string> = {
  gt: 'IsGreaterThan',
  gte: 'IsGreaterThanOrEqual',
  lt: 'IsLessThan',
  lte: 'IsLessThanOrEqual',
};

const suffixFor = (op: string | undefined) => (op ? (OPERATOR_SUFFIX[op] ?? '') : '');

const isDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value);

const midnight = (day: string) => `${day}T00:00:00Z`;

function nextMidnight(day: string) {
  const next = new Date(Date.parse(midnight(day)) + 86_400_000);
  return `${next.toISOString().slice(0, 10)}T00:00:00Z`;
}

/** The filter entries for one date field. */
function dateEntries(field: string, value: string, op: string | undefined, withOps: boolean): [string, string][] {
  if (!isDay(value)) return [[field + (withOps ? suffixFor(op) : ''), value]];
  if (!withOps) return [[field, midnight(value)]];
  if (!op || op === 'eq') {
    return [
      [`${field}IsGreaterThanOrEqual`, midnight(value)],
      [`${field}IsLessThan`, nextMidnight(value)],
    ];
  }
  return [[field + suffixFor(op), midnight(value)]];
}

export interface BuildJmapFilterArgs {
  /** What the reader picked: `field: value`, and `fieldOp: operator`. */
  appliedFilters: Record<string, string>;
  /** The list's filter definitions; they say which fields are dates. */
  filters?: Filter[];
  /** Always part of the query. */
  filtersStatic?: Record<string, unknown>;
  /** x: objects take operators and date ranges; others match exactly. */
  isXPrefixed: boolean;
}

export function buildJmapFilter({
  appliedFilters,
  filters = [],
  filtersStatic,
  isXPrefixed,
}: BuildJmapFilterArgs): Record<string, unknown> {
  const dates = new Set(filters.filter((f) => f.type === 'date').map((f) => f.field));
  const out: Record<string, unknown> = { ...filtersStatic };
  for (const [field, value] of Object.entries(appliedFilters)) {
    if (!value || field.endsWith('Op')) continue;
    const op = appliedFilters[`${field}Op`];
    const entries: [string, string][] = dates.has(field)
      ? dateEntries(field, value, op, isXPrefixed)
      : [[field + suffixFor(op), value]];
    for (const [key, v] of entries) out[key] = v;
  }
  return out;
}
