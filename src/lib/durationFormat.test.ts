/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import {
  DURATION_UNITS,
  SIZE_UNITS,
  bytesToHuman,
  formatDuration,
  formatSize,
  humanToBytes,
  humanToMs,
  msToHuman,
} from './durationFormat';

describe('sizes', () => {
  it('lists the units a size field offers, smallest first', () => {
    expect(SIZE_UNITS).toEqual(['B', 'KB', 'MB', 'GB', 'TB']);
  });

  it.each([
    [0, 0, 'B'],
    [1, 1, 'B'],
    [1023, 1023, 'B'],
    [1024, 1, 'KB'],
    [1500, 1.46, 'KB'],
    [1536, 1.5, 'KB'],
    [5 * 1024 ** 2, 5, 'MB'],
    [1024 ** 3 + 1, 1, 'GB'],
    [3 * 1024 ** 4, 3, 'TB'],
    [2048 * 1024 ** 4, 2048, 'TB'],
  ])('shows %d bytes as %d %s', (bytes, value, unit) => {
    expect(bytesToHuman(bytes)).toEqual({ value, unit });
  });

  it('leaves values under one byte as bytes', () => {
    expect(bytesToHuman(0.5)).toEqual({ value: 0.5, unit: 'B' });
    expect(bytesToHuman(-10)).toEqual({ value: -10, unit: 'B' });
  });

  it('turns a value and unit back into whole bytes', () => {
    expect(humanToBytes(1.5, 'KB')).toBe(1536);
    expect(humanToBytes(1.46, 'KB')).toBe(1495);
    expect(humanToBytes(2, 'GB')).toBe(2 * 1024 ** 3);
    expect(humanToBytes(7, 'B')).toBe(7);
  });

  it('passes the value through for a unit it does not know', () => {
    expect(humanToBytes(12, 'PB')).toBe(12);
  });

  it('formats as "value unit"', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(50 * 1024 ** 2)).toBe('50 MB');
  });
});

describe('durations', () => {
  it('lists the units a duration field offers, smallest first', () => {
    expect(DURATION_UNITS).toEqual(['ms', 's', 'min', 'h', 'd']);
  });

  it.each([
    [0, 0, 'ms'],
    [999, 999, 'ms'],
    [1000, 1, 's'],
    [1500, 1.5, 's'],
    [90_000, 1.5, 'min'],
    [3_600_000, 1, 'h'],
    [5_400_000, 1.5, 'h'],
    [86_400_000, 1, 'd'],
    [30 * 86_400_000, 30, 'd'],
    [100_000, 1.67, 'min'],
  ])('shows %d ms as %d %s', (ms, value, unit) => {
    expect(msToHuman(ms)).toEqual({ value, unit });
  });

  it('turns a value and unit back into whole milliseconds', () => {
    expect(humanToMs(1.5, 's')).toBe(1500);
    expect(humanToMs(2, 'min')).toBe(120_000);
    expect(humanToMs(1, 'd')).toBe(86_400_000);
    expect(humanToMs(1.67, 'min')).toBe(100_200);
    expect(humanToMs(9, 'weeks')).toBe(9);
  });

  it('spells a duration out by its parts', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(250)).toBe('250ms');
    expect(formatDuration(61_000)).toBe('1m 1s');
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(90_061_001)).toBe('1d 1h 1m 1s 1ms');
    expect(formatDuration(2 * 86_400_000 + 30_000)).toBe('2d 30s');
  });
});
