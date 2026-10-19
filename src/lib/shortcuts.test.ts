/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { isCommandBarKey } from './shortcuts';

const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey', boolean>> = {}) => ({
  key: k,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe('isCommandBarKey', () => {
  it('takes Ctrl+K and ⌘K, either case', () => {
    expect(isCommandBarKey(key('k', { ctrlKey: true }))).toBe(true);
    expect(isCommandBarKey(key('K', { metaKey: true }))).toBe(true);
  });

  it('ignores K alone or with Shift or Alt', () => {
    expect(isCommandBarKey(key('k'))).toBe(false);
    expect(isCommandBarKey(key('k', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isCommandBarKey(key('k', { metaKey: true, altKey: true }))).toBe(false);
    expect(isCommandBarKey(key('j', { ctrlKey: true }))).toBe(false);
  });
});
