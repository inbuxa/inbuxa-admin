/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The themes the admin offers: the same palettes as INBUXA webmail, in the
 * same order and under the same names. "ihasmail" is the default, the look in
 * index.css. The others' colors are in palettes.css, generated from ihasmail's
 * by scripts/import-palettes.py.
 */
export type PaletteId =
  | 'default'
  | 'ihasmail'
  | 'dracula'
  | 'gruvbox'
  | 'rose-pine'
  | 'tokyo-night'
  | 'catppuccin'
  | 'solarized'
  | 'ayu'
  | 'kanagawa'
  | 'everforest'
  | 'primer';

export const DEFAULT_PALETTE: PaletteId = 'ihasmail';

/** `swatch` is the palette's accent, light and dark, for the menu's color dot. */
export const PALETTES: { id: PaletteId; name: string; swatch: [string, string] }[] = [
  { id: 'default', name: 'Classic', swatch: ['#0f766e', '#2dd4bf'] },
  { id: 'ihasmail', name: 'ihasmail', swatch: ['#0d8a82', '#46cac3'] },
  { id: 'dracula', name: 'Dracula', swatch: ['#644ac9', '#bd93f9'] },
  { id: 'gruvbox', name: 'Gruvbox', swatch: ['#076678', '#83a598'] },
  { id: 'rose-pine', name: 'Rosé Pine', swatch: ['#907aa9', '#c4a7e7'] },
  { id: 'tokyo-night', name: 'Tokyo Night', swatch: ['#2959aa', '#7aa2f7'] },
  { id: 'catppuccin', name: 'Catppuccin', swatch: ['#8839ef', '#cba6f7'] },
  { id: 'solarized', name: 'Solarized', swatch: ['#268bd2', '#268bd2'] },
  { id: 'ayu', name: 'Ayu', swatch: ['#cb7f14', '#e6b450'] },
  { id: 'kanagawa', name: 'Kanagawa', swatch: ['#624c83', '#7e9cd8'] },
  { id: 'everforest', name: 'Everforest', swatch: ['#7d8f01', '#a7c080'] },
  { id: 'primer', name: 'Primer', swatch: ['#0969da', '#58a6ff'] },
];

export function isPaletteId(v: unknown): v is PaletteId {
  return PALETTES.some((p) => p.id === v);
}

export function applyPalette(id: PaletteId) {
  if (id === DEFAULT_PALETTE) delete document.documentElement.dataset.palette;
  else document.documentElement.dataset.palette = id;
}
