/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The command center's few colors, by what they mean rather than what they are. */
export type Tone = 'primary' | 'ok' | 'warn' | 'crit' | 'neutral';

export const TONE_VAR: Record<Tone, string> = {
  primary: 'var(--primary)',
  ok: 'var(--chart-4)',
  warn: 'var(--highlight)',
  crit: 'var(--destructive)',
  neutral: 'var(--chart-3)',
};
