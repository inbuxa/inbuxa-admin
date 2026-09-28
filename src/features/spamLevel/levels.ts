/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: how hard the spam filter is, as three levels (settings-reorg,
 * first wave). What the thresholds do (spam-filter/src/analysis/score.rs):
 *
 * - scoreSpam: a message scoring at or above it goes to Junk;
 * - scoreReject: at or above it, the message is refused during delivery, so
 *   the sender gets a bounce and a mistake is visible to them;
 * - scoreDiscard: at or above it, the message is accepted and silently
 *   deleted. Nobody learns of a mistake, so no level uses it.
 *
 * A reject or discard threshold of 0 is off. Balanced is the server's stock
 * setting.
 */

export type Level = 'relaxed' | 'balanced' | 'strict';
export const LEVELS: Level[] = ['relaxed', 'balanced', 'strict'];

export interface Thresholds {
  scoreSpam: number;
  scoreReject: number;
  scoreDiscard: number;
}

export const LEVEL_THRESHOLDS: Record<Level, Thresholds> = {
  relaxed: { scoreSpam: 8, scoreReject: 0, scoreDiscard: 0 },
  balanced: { scoreSpam: 5, scoreReject: 0, scoreDiscard: 0 },
  strict: { scoreSpam: 4, scoreReject: 12, scoreDiscard: 0 },
};

export function levelOf(t: Partial<Thresholds>): Level | null {
  return (
    LEVELS.find((l) => {
      const want = LEVEL_THRESHOLDS[l];
      return (
        Number(t.scoreSpam) === want.scoreSpam &&
        Number(t.scoreReject ?? 0) === want.scoreReject &&
        Number(t.scoreDiscard ?? 0) === want.scoreDiscard
      );
    }) ?? null
  );
}

/** What happens to a message by score, in words: "5 and up: Junk. 12 and up: refused." */
export function outcomes(t: Thresholds): string[] {
  const lines = [`Scoring ${t.scoreSpam} or more: filed in Junk.`];
  if (t.scoreReject > 0) lines.push(`${t.scoreReject} or more: refused, and the sender gets a bounce.`);
  if (t.scoreDiscard > 0) lines.push(`${t.scoreDiscard} or more: accepted and deleted without telling anyone.`);
  if (t.scoreReject <= 0 && t.scoreDiscard <= 0)
    lines.push('Nothing is refused or deleted: people can always look in Junk.');
  return lines;
}
