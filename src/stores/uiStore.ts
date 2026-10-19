/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queueAccountTheme } from '@/lib/accountSettings';
import { applyA11yPrefs, isContrastPref, isMotionPref, type ContrastPref, type MotionPref } from '@/lib/a11yPrefs';
import { applyPalette, DEFAULT_PALETTE, isPaletteId, type PaletteId } from '@/lib/palettes';

type Theme = 'light' | 'dark';

/**
 * Which shell draws the navigation. "modern" puts the layout switcher in the
 * top bar over a section bar with that layout's items; "legacy" is the
 * sidebar. A layout too deep for a menu bar keeps the sidebar either way.
 */
export type AdminLayout = 'modern' | 'legacy';

export const DEFAULT_ADMIN_LAYOUT: AdminLayout = 'modern';

export function isAdminLayout(value: unknown): value is AdminLayout {
  return value === 'modern' || value === 'legacy';
}

interface UIState {
  theme: Theme;
  /** The color palette, the same set inbuxa webmail offers. */
  palette: PaletteId;
  adminLayout: AdminLayout;
  /** High contrast and reduced motion, or whatever the system asks for. */
  contrast: ContrastPref;
  motion: MotionPref;
  sidebarOpen: boolean;
  /** The sidebar folded to a rail of icons, on wide screens. */
  sidebarCollapsed: boolean;
  activeSection: string;

  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  setPalette: (palette: PaletteId) => void;
  setAdminLayout: (layout: AdminLayout) => void;
  setContrast: (contrast: ContrastPref) => void;
  setMotion: (motion: MotionPref) => void;
  /** Take the theme saved with the account, without saving it back. */
  applyAccountTheme: (palette: PaletteId | null, mode: 'system' | 'light' | 'dark' | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebarCollapsed: () => void;
  setActiveSection: (section: string) => void;
}

const matches = (query: string) => typeof window !== 'undefined' && window.matchMedia?.(query).matches;

const systemTheme = (): Theme => (matches('(prefers-color-scheme: dark)') ? 'dark' : 'light');

const showTheme = (theme: Theme) => document.documentElement.classList.toggle('dark', theme === 'dark');

export const useUIStore = create<UIState>()(
  persist(
    (set, get) => {
      /** Show a theme the reader picked, and save it with their account. */
      const pickTheme = (theme: Theme) => {
        showTheme(theme);
        set({ theme });
        queueAccountTheme(get().palette, theme, theme);
      };

      return {
        theme: systemTheme(),
        // Open on tablets and up; a phone opens it from the menu button.
        sidebarOpen: typeof window === 'undefined' || (window.matchMedia?.('(min-width: 768px)').matches ?? true),
        sidebarCollapsed: false,
        palette: DEFAULT_PALETTE,
        adminLayout: DEFAULT_ADMIN_LAYOUT,
        contrast: 'system',
        motion: 'system',
        activeSection: '',

        setTheme: pickTheme,
        toggleTheme: () => pickTheme(get().theme === 'light' ? 'dark' : 'light'),

        setPalette: (palette) => {
          applyPalette(palette);
          set({ palette });
          queueAccountTheme(palette, null, get().theme);
        },

        applyAccountTheme: (palette, mode) => {
          const theme = mode && (mode === 'system' ? systemTheme() : mode);
          if (palette) applyPalette(palette);
          if (theme) showTheme(theme);
          set({ ...(palette && { palette }), ...(theme && { theme }) });
        },

        setContrast: (contrast) => {
          applyA11yPrefs(contrast, get().motion);
          set({ contrast });
        },

        setMotion: (motion) => {
          applyA11yPrefs(get().contrast, motion);
          set({ motion });
        },

        setAdminLayout: (adminLayout) => set({ adminLayout }),
        toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
        setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
        toggleSidebarCollapsed: () => set({ sidebarCollapsed: !get().sidebarCollapsed }),
        setActiveSection: (activeSection) => set({ activeSection }),
      };
    },
    {
      name: 'inbuxa-ui',
      partialize: ({ theme, palette, adminLayout, contrast, motion, sidebarCollapsed }) => ({
        theme,
        palette,
        adminLayout,
        contrast,
        motion,
        sidebarCollapsed,
      }),
      // Saved values from another version may no longer exist; fall back, then show the look.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        if (!isAdminLayout(state.adminLayout)) state.adminLayout = DEFAULT_ADMIN_LAYOUT;
        if (!isContrastPref(state.contrast)) state.contrast = 'system';
        if (!isMotionPref(state.motion)) state.motion = 'system';
        showTheme(state.theme);
        applyPalette(isPaletteId(state.palette) ? state.palette : DEFAULT_PALETTE);
        applyA11yPrefs(state.contrast, state.motion);
      },
    },
  ),
);
