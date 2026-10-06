/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { levelOf, LEVEL_THRESHOLDS, outcomes } from './levels';

describe('spam levels', () => {
  it('Balanced is the stock setting', () => {
    expect(levelOf({ scoreSpam: 5, scoreReject: 0, scoreDiscard: 0 })).toBe('balanced');
  });

  it('recognise each level, and hand-set values as none', () => {
    for (const l of ['relaxed', 'balanced', 'strict'] as const) expect(levelOf(LEVEL_THRESHOLDS[l])).toBe(l);
    expect(levelOf({ scoreSpam: 6, scoreReject: 0, scoreDiscard: 0 })).toBeNull();
    expect(levelOf({ scoreSpam: 5, scoreReject: 0, scoreDiscard: 20 })).toBeNull();
  });

  it('never discard, and say what happens in words', () => {
    for (const l of ['relaxed', 'balanced', 'strict'] as const) expect(LEVEL_THRESHOLDS[l].scoreDiscard).toBe(0);
    expect(outcomes(LEVEL_THRESHOLDS.strict)).toEqual([
      'Scoring 4 or more: filed in Junk.',
      '12 or more: refused, and the sender gets a bounce.',
    ]);
    expect(outcomes(LEVEL_THRESHOLDS.balanced)[1]).toBe(
      'Nothing is refused or deleted: people can always look in Junk.',
    );
  });
});
