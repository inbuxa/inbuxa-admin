/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { squarify } from './treemap';

describe('squarify', () => {
  it('fills the box, with areas in proportion to the values', () => {
    const tiles = squarify([6, 6, 4, 3, 2, 2, 1], (v) => v, 600, 400);
    expect(tiles).toHaveLength(7);
    const area = tiles.reduce((s, t) => s + t.w * t.h, 0);
    expect(area).toBeCloseTo(600 * 400, 3);
    for (const t of tiles) {
      expect(t.w * t.h).toBeCloseTo((t.item / 24) * 600 * 400, 3);
      expect(t.x).toBeGreaterThanOrEqual(-1e-9);
      expect(t.y).toBeGreaterThanOrEqual(-1e-9);
      expect(t.x + t.w).toBeLessThanOrEqual(600 + 1e-6);
      expect(t.y + t.h).toBeLessThanOrEqual(400 + 1e-6);
    }
  });

  it('keeps tiles reasonably square', () => {
    const tiles = squarify([6, 6, 4, 3, 2, 2, 1], (v) => v, 600, 400);
    const worst = Math.max(...tiles.map((t) => Math.max(t.w / t.h, t.h / t.w)));
    expect(worst).toBeLessThan(4);
  });

  it('gives nothing for nothing', () => {
    expect(squarify([0, 0], (v) => v, 100, 100)).toEqual([]);
    expect(squarify([], (v: number) => v, 100, 100)).toEqual([]);
    expect(squarify([1], (v) => v, 0, 100)).toEqual([]);
  });
});
