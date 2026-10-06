/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what the keyboard shortcuts share (admin UX roadmap, item 13); the
 * handler and the `?` sheet are components/common/KeyboardShortcuts.tsx.
 */

import { useEffect, useRef } from 'react';

/** Ask the top bar to open the command bar. */
export const OPEN_COMMAND_BAR = 'inbuxa:open-command-bar';
/** Open the shortcut sheet (the account menu's Keyboard shortcuts). */
export const OPEN_SHORTCUTS = 'inbuxa:open-shortcuts';

/** How long `g` waits for its second key. */
export const GO_WINDOW_MS = 1500;

type Handler = () => void;
export const pageKeys = new Map<string, Handler>();

/** A page's own single-key shortcut, while it is on screen (e.g. `n` for a new item). */
export function useShortcut(key: string, handler: Handler | null) {
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  const active = handler !== null;
  useEffect(() => {
    if (!active) return;
    const run = () => latest.current?.();
    pageKeys.set(key, run);
    return () => {
      if (pageKeys.get(key) === run) pageKeys.delete(key);
    };
  }, [key, active]);
}

/** Whether a key press belongs to whatever has focus, not to the shortcuts. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag === 'INPUT') {
    const type = (target as HTMLInputElement).type;
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file'].includes(type);
  }
  return target.closest('[role="textbox"], [role="combobox"], [role="searchbox"]') !== null;
}
