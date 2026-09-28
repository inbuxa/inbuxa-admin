/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: an expression in a list column, instead of "-". In words when it
 * can be said in words, else the expression as written.
 */

import { summarize, type ExpressionHints } from './simple';

export interface ExpressionCell {
  text: string;
  /** True when `text` is the expression itself, to show as code. */
  code: boolean;
}

export function expressionCell(value: unknown, hints: ExpressionHints | undefined): ExpressionCell | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { match?: Record<string, { if?: string; then?: string }>; else?: unknown };
  const match = v.match ?? {};
  const otherwise = typeof v.else === 'string' ? v.else : '';
  const rules = Object.values(match).map((r) => ({ if: String(r?.if ?? ''), then: String(r?.then ?? '') }));
  if (hints) {
    const words = summarize({ match: Object.fromEntries(rules.map((r, i) => [String(i), r])), else: otherwise }, hints);
    if (words) return { text: words, code: false };
  }
  if (rules.length === 0) return otherwise ? { text: otherwise, code: true } : null;
  const n = rules.length === 1 ? '1 rule' : `${rules.length} rules`;
  return { text: otherwise ? `${n}; otherwise ${otherwise}` : n, code: true };
}
