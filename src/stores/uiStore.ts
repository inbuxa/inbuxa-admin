/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { queueAccountTheme } from '@/lib/accountSettings';
import { applyPalette, DEFAULT_PALETTE, isPaletteId, type PaletteId } from '@/lib/palettes';
import { applyA11yPrefs, isContrastPref, isMotionPref, type ContrastPref, type MotionPref } from '@/lib/a11yPrefs';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark';

/**
 * INBUXA: which shell draws the navigation. "modern" is the two-tier shell —
 * the layout switcher in the top bar over a section bar carrying that layout's
 * own items, and no sidebar. "legacy" is the sidebar the old web UI had. A
 * layout too deep for a menu bar keeps the sidebar under either setting.
 */
export type AdminLayout = 'modern' | 'legacy';

export const DEFAULT_ADMIN_LAYOUT: AdminLayout = 'modern';

export function isAdminLayout(value: unknown): value is AdminLayout {
  return value === 'modern' || value === 'legacy';
}

interface UIState {
  theme: Theme;
  /** INBUXA: the color palette, the same set INBUXA webmail offers. */
  palette: PaletteId;
  /** INBUXA: the navigation shell, the reader's own choice. */
  adminLayout: AdminLayout;
  /** inbuxa: high contrast and reduced motion, or the system's setting (roadmap item 13). */
  contrast: ContrastPref;
  motion: MotionPref;
  sidebarOpen: boolean;
  /** INBUXA: the sidebar folded to a rail of icon tiles, on wide screens. */
  sidebarCollapsed: boolean;
  activeSection: string;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: PaletteId) => void;
  setAdminLayout: (layout: AdminLayout) => void;
  setContrast: (contrast: ContrastPref) => void;
  setMotion: (motion: MotionPref) => void;
  /** INBUXA: take the theme stored with the account, without writing it back. */
  applyAccountTheme: (palette: PaletteId | null, mode: 'system' | 'light' | 'dark' | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setActiveSection: (section: string) => void;
}

function applyThemeClass(theme: Theme) {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => ({
      theme:
        typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
      sidebarOpen: typeof window !== 'undefined' ? (window.matchMedia?.('(min-width: 768px)').matches ?? true) : true,
      sidebarCollapsed: false,
      palette: DEFAULT_PALETTE,
      adminLayout: DEFAULT_ADMIN_LAYOUT,
      contrast: 'system',
      motion: 'system',
      activeSection: '',

      toggleTheme: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        applyThemeClass(next);
        set({ theme: next });
        queueAccountTheme(get().palette, next, next);
      },

      setTheme: (theme) => {
        applyThemeClass(theme);
        set({ theme });
        queueAccountTheme(get().palette, theme, theme);
      },

      toggleSidebar: () => {
        set({ sidebarOpen: !get().sidebarOpen });
      },

      setSidebarOpen: (open) => {
        set({ sidebarOpen: open });
      },

      setPalette: (palette) => {
        applyPalette(palette);
        set({ palette });
        queueAccountTheme(palette, null, get().theme);
      },

      setAdminLayout: (layout) => {
        set({ adminLayout: layout });
      },

      setContrast: (contrast) => {
        applyA11yPrefs(contrast, get().motion);
        set({ contrast });
      },

      setMotion: (motion) => {
        applyA11yPrefs(get().contrast, motion);
        set({ motion });
      },

      applyAccountTheme: (palette, mode) => {
        const next: Partial<UIState> = {};
        if (palette) {
          applyPalette(palette);
          next.palette = palette;
        }
        if (mode) {
          const theme: Theme =
            mode === 'system' ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : mode;
          applyThemeClass(theme);
          next.theme = theme;
        }
        set(next);
      },

      toggleSidebarCollapsed: () => {
        set({ sidebarCollapsed: !get().sidebarCollapsed });
      },

      setActiveSection: (section) => {
        set({ activeSection: section });
      },
    }),
    {
      name: 'inbuxa-ui',
      partialize: (state) => ({
        theme: state.theme,
        palette: state.palette,
        adminLayout: state.adminLayout,
        contrast: state.contrast,
        motion: state.motion,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => {
        return (state) => {
          if (state) {
            applyThemeClass(state.theme);
            applyPalette(isPaletteId(state.palette) ? state.palette : DEFAULT_PALETTE);
            if (!isAdminLayout(state.adminLayout)) state.adminLayout = DEFAULT_ADMIN_LAYOUT;
            if (!isContrastPref(state.contrast)) state.contrast = 'system';
            if (!isMotionPref(state.motion)) state.motion = 'system';
            applyA11yPrefs(state.contrast, state.motion);
          }
        };
      },
    },
  ),
);
