/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { expressionCell } from './cell';

describe('expressionCell', () => {
  it('says a plain expression as written', () => {
    expect(
      expressionCell({ match: {}, else: "metric('queue.count') > 500" }, { constants: [], variables: [] }),
    ).toEqual({ text: "metric('queue.count') > 500", code: true });
  });

  it('uses words when every part has them', () => {
    const hints = { constants: ['relaxed', 'disable'], variables: ['local_port'] };
    const cell = expressionCell({ match: { 0: { if: 'local_port == 25', then: 'relaxed' } }, else: 'disable' }, hints);
    expect(cell?.code).toBe(false);
    expect(cell?.text).toMatch(/^Relaxed when .* 25; otherwise off$/);
  });

  it('counts rules it cannot put in words', () => {
    expect(expressionCell({ match: { a: { if: 'x', then: 'y' } }, else: 'z' }, undefined)).toEqual({
      text: '1 rule; otherwise z',
      code: true,
    });
  });

  it('is null for nothing', () => {
    expect(expressionCell(null, undefined)).toBeNull();
    expect(expressionCell({ match: {}, else: '' }, undefined)).toBeNull();
  });
});
