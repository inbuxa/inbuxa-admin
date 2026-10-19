/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const memory = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => void memory.set(k, v),
  removeItem: (k: string) => void memory.delete(k),
  clear: () => memory.clear(),
});

const queueAccountTheme = vi.fn();
const applyPalette = vi.fn();
const applyA11yPrefs = vi.fn();
vi.mock('@/lib/accountSettings', () => ({ queueAccountTheme: (...a: unknown[]) => queueAccountTheme(...a) }));
vi.mock('@/lib/palettes', async (real) => ({
  ...(await real<typeof import('@/lib/palettes')>()),
  applyPalette: (...a: unknown[]) => applyPalette(...a),
}));
vi.mock('@/lib/a11yPrefs', async (real) => ({
  ...(await real<typeof import('@/lib/a11yPrefs')>()),
  applyA11yPrefs: (...a: unknown[]) => applyA11yPrefs(...a),
}));

const { useUIStore, isAdminLayout, DEFAULT_ADMIN_LAYOUT } = await import('./uiStore');
const ui = () => useUIStore.getState();
const isDark = () => document.documentElement.classList.contains('dark');

function prefersDark(dark: boolean) {
  window.matchMedia = ((query: string) => ({ matches: dark && query.includes('dark') })) as typeof window.matchMedia;
}

beforeEach(() => {
  vi.clearAllMocks();
  useUIStore.setState({ theme: 'light', palette: 'ihasmail', contrast: 'system', motion: 'system' });
  document.documentElement.classList.remove('dark');
});

describe('theme', () => {
  it('sets the dark class and queues the theme for the account', () => {
    ui().setTheme('dark');
    expect(isDark()).toBe(true);
    expect(queueAccountTheme).toHaveBeenLastCalledWith('ihasmail', 'dark', 'dark');
    ui().toggleTheme();
    expect(ui().theme).toBe('light');
    expect(isDark()).toBe(false);
    expect(queueAccountTheme).toHaveBeenLastCalledWith('ihasmail', 'light', 'light');
  });

  it('applies a palette and queues it without a mode', () => {
    ui().setTheme('dark');
    ui().setPalette('dracula');
    expect(applyPalette).toHaveBeenCalledWith('dracula');
    expect(ui().palette).toBe('dracula');
    expect(queueAccountTheme).toHaveBeenLastCalledWith('dracula', null, 'dark');
  });

  it("takes the account's theme without writing it back", () => {
    ui().applyAccountTheme('dracula', 'dark');
    expect(ui()).toMatchObject({ palette: 'dracula', theme: 'dark' });
    expect(isDark()).toBe(true);
    expect(queueAccountTheme).not.toHaveBeenCalled();
  });

  it('follows the system for a "system" account theme', () => {
    prefersDark(true);
    ui().applyAccountTheme(null, 'system');
    expect(ui().theme).toBe('dark');
    prefersDark(false);
    ui().applyAccountTheme(null, 'system');
    expect(ui().theme).toBe('light');
  });

  it('leaves what the account has no setting for', () => {
    ui().setTheme('dark');
    ui().applyAccountTheme(null, null);
    expect(ui()).toMatchObject({ palette: 'ihasmail', theme: 'dark' });
    expect(applyPalette).not.toHaveBeenCalled();
  });
});

describe('accessibility', () => {
  it('applies contrast and motion together', () => {
    ui().setContrast('high');
    expect(applyA11yPrefs).toHaveBeenLastCalledWith('high', 'system');
    ui().setMotion('reduce');
    expect(applyA11yPrefs).toHaveBeenLastCalledWith('high', 'reduce');
    expect(ui()).toMatchObject({ contrast: 'high', motion: 'reduce' });
  });
});

describe('navigation', () => {
  it('opens, closes and folds the sidebar', () => {
    ui().setSidebarOpen(false);
    ui().toggleSidebar();
    expect(ui().sidebarOpen).toBe(true);
    const folded = ui().sidebarCollapsed;
    ui().toggleSidebarCollapsed();
    expect(ui().sidebarCollapsed).toBe(!folded);
  });

  it('keeps the layout and the active section', () => {
    ui().setAdminLayout('legacy');
    ui().setActiveSection('mail');
    expect(ui()).toMatchObject({ adminLayout: 'legacy', activeSection: 'mail' });
  });

  it('knows the two layouts', () => {
    expect(DEFAULT_ADMIN_LAYOUT).toBe('modern');
    expect(isAdminLayout('modern')).toBe(true);
    expect(isAdminLayout('legacy')).toBe(true);
    expect(isAdminLayout('sidebar')).toBe(false);
  });
});

describe('persistence', () => {
  it('keeps the look and the layout in local storage, not the open sidebar or section', () => {
    ui().setTheme('dark');
    ui().setActiveSection('mail');
    ui().setSidebarOpen(true);
    const saved = JSON.parse(memory.get('inbuxa-ui')!);
    expect(Object.keys(saved.state).sort()).toEqual(
      ['adminLayout', 'contrast', 'motion', 'palette', 'sidebarCollapsed', 'theme'].sort(),
    );
  });

  it('reads them back, replacing values it does not know and applying the look', async () => {
    memory.set(
      'inbuxa-ui',
      JSON.stringify({
        state: { theme: 'dark', palette: 'nope', adminLayout: 'tiles', contrast: 'max', motion: 'reduce' },
        version: 0,
      }),
    );
    await useUIStore.persist.rehydrate();
    expect(ui()).toMatchObject({ theme: 'dark', adminLayout: 'modern', contrast: 'system', motion: 'reduce' });
    expect(isDark()).toBe(true);
    expect(applyPalette).toHaveBeenLastCalledWith('ihasmail');
    expect(applyA11yPrefs).toHaveBeenLastCalledWith('system', 'reduce');
  });
});
