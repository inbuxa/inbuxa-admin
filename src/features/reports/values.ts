/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the report settings that decide whether reports go out, read
 * from and written to their expressions (settings-reorg, second wave).
 *
 * - Summaries (DMARC and TLS aggregate reports) take hourly, daily, weekly
 *   or disable.
 * - Failure reports (DMARC, DKIM, SPF) take a rate such as [1, 1d]: at most
 *   one a day to each address. Anything that isn't a rate, such as false,
 *   sends none (common/src/expr: a value that won't convert to a Rate makes
 *   eval_if answer None).
 *
 * Only plain values are read. An expression with conditions is left to its
 * own page.
 */

export type Expr = { match: Record<string, { if: string; then: string }>; else: string };
export type Frequency = 'hourly' | 'daily' | 'weekly' | 'disable';
export const FREQUENCIES: Frequency[] = ['hourly', 'daily', 'weekly', 'disable'];

export const FAILURE_ON = '[1, 1d]';
export const FAILURE_OFF = 'false';

/** The plain value of an expression, or null when it has conditions. */
export function plain(e: unknown): string | null {
  const x = (e ?? {}) as Partial<Expr>;
  if (Object.keys(x.match ?? {}).length > 0) return null;
  return (x.else ?? '').trim();
}

export function frequencyOf(e: unknown): Frequency | null {
  const v = plain(e);
  return v !== null && (FREQUENCIES as string[]).includes(v) ? (v as Frequency) : null;
}

/** 'on' for a rate, 'off' for anything that isn't one, null for conditions. */
export function failureOf(e: unknown): 'on' | 'off' | null {
  const v = plain(e);
  if (v === null) return null;
  return /^\[\s*\d+\s*,\s*[^\]]+\]$/.test(v) ? 'on' : 'off';
}

export function constant(value: string): Expr {
  return { match: {}, else: value };
}

/** The three failure-report switches read together: one answer if they agree. */
export function failuresTogether(values: unknown[]): 'on' | 'off' | 'mixed' {
  const states = values.map(failureOf);
  if (states.every((s) => s === 'on')) return 'on';
  if (states.every((s) => s === 'off')) return 'off';
  return 'mixed';
}

/** "postmaster@*, dmarc@example.org" ⇄ the set the server stores. */
export function addressSet(text: string): Record<string, boolean> {
  return Object.fromEntries(
    text
      .split(/[\s,]+/)
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean)
      .map((a) => [a, true]),
  );
}
