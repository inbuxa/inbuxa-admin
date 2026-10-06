/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: contrast and motion, each the reader's own choice or the system's
 * (admin UX roadmap, item 13). They sit on top of any palette and of light
 * or dark: `data-contrast="high"` and `data-motion="reduce"` on <html>, read
 * by a11y.css.
 */

export type ContrastPref = 'system' | 'standard' | 'high';
export type MotionPref = 'system' | 'reduce' | 'full';

export const isContrastPref = (v: unknown): v is ContrastPref => v === 'system' || v === 'standard' || v === 'high';
export const isMotionPref = (v: unknown): v is MotionPref => v === 'system' || v === 'reduce' || v === 'full';

const query = (q: string) => (typeof window !== 'undefined' ? (window.matchMedia?.(q) ?? null) : null);

/** What the choice comes to, given what the system asks for. */
export function effectiveContrast(pref: ContrastPref, systemWantsMore: boolean): 'standard' | 'high' {
  return pref === 'system' ? (systemWantsMore ? 'high' : 'standard') : pref;
}

export function effectiveMotion(pref: MotionPref, systemWantsLess: boolean): 'full' | 'reduce' {
  return pref === 'system' ? (systemWantsLess ? 'reduce' : 'full') : pref;
}

let current: { contrast: ContrastPref; motion: MotionPref } = { contrast: 'system', motion: 'system' };

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const high = effectiveContrast(current.contrast, query('(prefers-contrast: more)')?.matches ?? false) === 'high';
  const reduce =
    effectiveMotion(current.motion, query('(prefers-reduced-motion: reduce)')?.matches ?? false) === 'reduce';
  if (high) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  if (reduce) root.dataset.motion = 'reduce';
  else delete root.dataset.motion;
}

let watching = false;

/** Sets the choices and keeps "system" in step with the system's own setting. */
export function applyA11yPrefs(contrast: ContrastPref, motion: MotionPref) {
  current = { contrast, motion };
  apply();
  if (!watching) {
    watching = true;
    query('(prefers-contrast: more)')?.addEventListener?.('change', apply);
    query('(prefers-reduced-motion: reduce)')?.addEventListener?.('change', apply);
  }
}
