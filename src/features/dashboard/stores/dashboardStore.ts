/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Period, PresetKey } from '../types/metrics';

export const AUTO_REFRESH = [0, 1, 5, 10, 15] as const;
export type AutoRefresh = (typeof AUTO_REFRESH)[number];

interface DashboardState {
  period: Period;
  setPeriod: (period: Period) => void;
  setPreset: (preset: PresetKey) => void;
  /**
   * inbuxa: the period a chart was zoomed from, while zoomed. Zooming makes the
   * period a custom window; only this one is remembered, so a reload is back
   * at the preset rather than in an old window.
   */
  zoomedFrom: Period | null;
  zoomTo: (from: Date, to: Date) => void;
  resetZoom: () => void;
  /** INBUXA: minutes between automatic refreshes of the dashboards; 0 is off. */
  autoRefresh: AutoRefresh;
  setAutoRefresh: (minutes: AutoRefresh) => void;
  /** INBUXA: counts refreshes, by hand or on the timer; every panel re-fetches when it moves. */
  tick: number;
  bump: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      period: { kind: 'preset', preset: '24h' } as Period,

      setPeriod: (period) => set({ period, zoomedFrom: null }),
      setPreset: (preset) => set({ period: { kind: 'preset', preset }, zoomedFrom: null }),
      zoomedFrom: null,
      zoomTo: (from, to) =>
        set((s) => ({ period: { kind: 'custom', from, to }, zoomedFrom: s.zoomedFrom ?? s.period })),
      resetZoom: () => set((s) => (s.zoomedFrom ? { period: s.zoomedFrom, zoomedFrom: null } : {})),
      autoRefresh: 5,
      setAutoRefresh: (autoRefresh) => set({ autoRefresh }),
      tick: 0,
      bump: () => set((s) => ({ tick: s.tick + 1 })),
    }),
    {
      name: 'dashboard.period',
      partialize: (state) => ({ period: state.zoomedFrom ?? state.period, autoRefresh: state.autoRefresh }),
    },
  ),
);
