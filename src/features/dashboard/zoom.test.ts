/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createJSONStorage } from 'zustand/middleware';
import { getBucketCount, sliceAt, zoomWindow } from './helpers';
import { useDashboardStore } from './stores/dashboardStore';

const HOUR = 3_600_000;
const FROM = new Date('2026-10-05T00:00:00Z');
const at = (h: number) => new Date(FROM.getTime() + h * HOUR);

describe('zoomWindow', () => {
  it('runs from the start of the first slice to the end of the last, either way round', () => {
    // 24 h in 48 slices of 30 min: slices 20 to 31 are 10:00 to 16:00.
    expect(zoomWindow(FROM, at(24), 48, 20, 31)).toEqual({ from: at(10), to: at(16) });
    expect(zoomWindow(FROM, at(24), 48, 31, 20)).toEqual({ from: at(10), to: at(16) });
  });

  it('widens a window under three hours around its middle', () => {
    // Slices 20 and 21: 10:00 to 11:00, widened to 09:00 to 12:00.
    expect(zoomWindow(FROM, at(24), 48, 20, 21)).toEqual({ from: at(9), to: at(12) });
  });

  it('keeps a widened window inside the chart', () => {
    expect(zoomWindow(FROM, at(24), 48, 0, 1)).toEqual({ from: at(0), to: at(3) });
    expect(zoomWindow(FROM, at(24), 48, 46, 47)).toEqual({ from: at(21), to: at(24) });
  });

  it('has nothing to zoom into once the chart is three hours or less', () => {
    expect(zoomWindow(FROM, at(3), 3, 0, 2)).toBeNull();
  });
});

describe('sliceAt', () => {
  // A plot from x=100 to x=500, 5 slices.
  it('puts line and area slices on points, edge to edge', () => {
    expect(sliceAt(100, 100, 500, 5, false)).toBe(0);
    expect(sliceAt(300, 100, 500, 5, false)).toBe(2);
    expect(sliceAt(500, 100, 500, 5, false)).toBe(4);
    expect(sliceAt(160, 100, 500, 5, false)).toBe(1);
  });

  it('puts bar slices in bands', () => {
    expect(sliceAt(100, 100, 500, 5, true)).toBe(0);
    expect(sliceAt(179, 100, 500, 5, true)).toBe(0);
    expect(sliceAt(181, 100, 500, 5, true)).toBe(1);
    expect(sliceAt(500, 100, 500, 5, true)).toBe(4);
  });

  it('holds a pointer past either edge to the end slice', () => {
    expect(sliceAt(20, 100, 500, 5, false)).toBe(0);
    expect(sliceAt(900, 100, 500, 5, true)).toBe(4);
  });

  it('has no slice on an empty plot', () => {
    expect(sliceAt(300, 100, 100, 5, false)).toBeNull();
    expect(sliceAt(300, 100, 500, 0, false)).toBeNull();
  });
});

describe('getBucketCount for a zoomed window', () => {
  const custom = (h: number) => ({ kind: 'custom' as const, from: FROM, to: at(h) });

  it('gives a slice per hour', () => {
    expect(getBucketCount(custom(6))).toBe(6);
    expect(getBucketCount(custom(40))).toBe(40);
  });

  it('keeps between 3 and 60 slices', () => {
    expect(getBucketCount(custom(2))).toBe(3);
    expect(getBucketCount(custom(24 * 20))).toBe(60);
  });
});

describe('zooming the dashboard period', () => {
  // In memory: Node's own `localStorage` global, empty without a storage file, hides happy-dom's.
  const saved = new Map<string, string>();
  beforeAll(() =>
    useDashboardStore.persist.setOptions({
      storage: createJSONStorage(() => ({
        getItem: (k) => saved.get(k) ?? null,
        setItem: (k, v) => void saved.set(k, v),
        removeItem: (k) => void saved.delete(k),
      })),
    }),
  );
  beforeEach(() => useDashboardStore.getState().setPreset('7d'));

  it('remembers the preset it zoomed from, and goes back to it', () => {
    useDashboardStore.getState().zoomTo(at(10), at(16));
    expect(useDashboardStore.getState().period).toEqual({ kind: 'custom', from: at(10), to: at(16) });
    expect(useDashboardStore.getState().zoomedFrom).toEqual({ kind: 'preset', preset: '7d' });

    // Zooming again from inside a zoom still goes back to the preset.
    useDashboardStore.getState().zoomTo(at(11), at(14));
    expect(useDashboardStore.getState().zoomedFrom).toEqual({ kind: 'preset', preset: '7d' });

    useDashboardStore.getState().resetZoom();
    expect(useDashboardStore.getState().period).toEqual({ kind: 'preset', preset: '7d' });
    expect(useDashboardStore.getState().zoomedFrom).toBeNull();
  });

  it('ends the zoom when a preset is picked', () => {
    useDashboardStore.getState().zoomTo(at(10), at(16));
    useDashboardStore.getState().setPreset('30d');
    expect(useDashboardStore.getState().period).toEqual({ kind: 'preset', preset: '30d' });
    expect(useDashboardStore.getState().zoomedFrom).toBeNull();
  });

  it('saves the preset, not the zoomed window', () => {
    useDashboardStore.getState().zoomTo(at(10), at(16));
    const stored = JSON.parse(saved.get('dashboard.period') ?? '{}');
    expect(stored.state.period).toEqual({ kind: 'preset', preset: '7d' });
  });
});
