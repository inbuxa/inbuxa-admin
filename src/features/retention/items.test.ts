/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { fromParts, ITEMS, RETENTION_FIELDS, toParts, words } from './items';

describe('durations', () => {
  it('show whole days as days and the rest as hours', () => {
    expect(toParts(2_592_000_000)).toEqual({ n: 30, unit: 'days' });
    expect(toParts(43_200_000)).toEqual({ n: 12, unit: 'hours' });
    expect(fromParts(3, 'days')).toBe(259_200_000);
    expect(words(86_400_000)).toBe('1 day');
    expect(words(7_776_000_000)).toBe('90 days');
  });
});

describe('items', () => {
  it('cover every duration on x:DataRetention once, plus log files', () => {
    expect(RETENTION_FIELDS).toHaveLength(9);
    expect(new Set(ITEMS.map((i) => i.field)).size).toBe(ITEMS.length);
    expect(ITEMS.some((i) => i.field === 'logs')).toBe(true);
  });
});
