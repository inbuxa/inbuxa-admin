/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The dashboards' shared controls: the period shown, a chart zoom, and refreshing. */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Period, PresetKey } from '../types/metrics';

/** The automatic refresh choices, in minutes; 0 is off. */
export const AUTO_REFRESH = [0, 1, 5, 10, 15] as const;
export type AutoRefresh = (typeof AUTO_REFRESH)[number];

interface DashboardState {
  period: Period;
  setPeriod: (period: Period) => void;
  setPreset: (preset: PresetKey) => void;
  /**
   * While a chart is zoomed, the period it was zoomed from. Zooming makes the
   * period a custom window; only this one is saved, so a reload comes back
   * at the preset and not in an old window.
   */
  zoomedFrom: Period | null;
  zoomTo: (from: Date, to: Date) => void;
  resetZoom: () => void;
  autoRefresh: AutoRefresh;
  setAutoRefresh: (minutes: AutoRefresh) => void;
  /** Moves on every refresh, by hand or on the timer; each panel fetches again when it does. */
  tick: number;
  bump: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      period: { kind: 'preset', preset: '24h' },
      zoomedFrom: null,
      autoRefresh: 5,
      tick: 0,

      setPeriod: (period) => set({ period, zoomedFrom: null }),
      setPreset: (preset) => set({ period: { kind: 'preset', preset }, zoomedFrom: null }),
      zoomTo: (from, to) =>
        set((s) => ({ period: { kind: 'custom', from, to }, zoomedFrom: s.zoomedFrom ?? s.period })),
      resetZoom: () => set((s) => (s.zoomedFrom ? { period: s.zoomedFrom, zoomedFrom: null } : {})),
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      bump: () => set((s) => ({ tick: s.tick + 1 })),
    }),
    {
      name: 'dashboard.period',
      partialize: (s) => ({ period: s.zoomedFrom ?? s.period, autoRefresh: s.autoRefresh }),
    },
  ),
);
