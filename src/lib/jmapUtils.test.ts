/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import { jmapMapToArray } from './jmapUtils';

describe('jmapMapToArray', () => {
  it('keeps an array', () => {
    const list = ['a', 'b'];
    expect(jmapMapToArray(list)).toBe(list);
  });

  it('orders an object by its numeric keys', () => {
    expect(jmapMapToArray({ '10': 'k', '2': 'c', '0': 'a', '1': 'b' })).toEqual(['a', 'b', 'c', 'k']);
  });

  it('reads anything else as an empty list', () => {
    expect(jmapMapToArray(null)).toEqual([]);
    expect(jmapMapToArray(undefined)).toEqual([]);
    expect(jmapMapToArray('abc')).toEqual([]);
  });
});
