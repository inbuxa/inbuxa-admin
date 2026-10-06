/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it } from 'vitest';
import { applyA11yPrefs, effectiveContrast, effectiveMotion, isContrastPref, isMotionPref } from './a11yPrefs';
import { isTyping } from './shortcuts';

describe('a11y preferences', () => {
  afterEach(() => {
    delete document.documentElement.dataset.contrast;
    delete document.documentElement.dataset.motion;
  });

  it('"system" follows the system; a choice overrides it', () => {
    expect(effectiveContrast('system', true)).toBe('high');
    expect(effectiveContrast('system', false)).toBe('standard');
    expect(effectiveContrast('standard', true)).toBe('standard');
    expect(effectiveContrast('high', false)).toBe('high');
    expect(effectiveMotion('system', true)).toBe('reduce');
    expect(effectiveMotion('system', false)).toBe('full');
    expect(effectiveMotion('full', true)).toBe('full');
    expect(effectiveMotion('reduce', false)).toBe('reduce');
  });

  it('marks <html> for the stylesheet', () => {
    applyA11yPrefs('high', 'reduce');
    expect(document.documentElement.dataset.contrast).toBe('high');
    expect(document.documentElement.dataset.motion).toBe('reduce');
    applyA11yPrefs('standard', 'full');
    expect(document.documentElement.dataset.contrast).toBeUndefined();
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });

  it('rejects stored values it does not know', () => {
    expect(isContrastPref('high')).toBe(true);
    expect(isContrastPref('max')).toBe(false);
    expect(isMotionPref('reduce')).toBe(true);
    expect(isMotionPref(undefined)).toBe(false);
  });
});

describe('isTyping', () => {
  it('is true in text fields and false on buttons and checkboxes', () => {
    const el = (html: string) => {
      const box = document.createElement('div');
      box.innerHTML = html;
      return box.firstElementChild;
    };
    expect(isTyping(el('<input type="text">'))).toBe(true);
    expect(isTyping(el('<input>'))).toBe(true);
    expect(isTyping(el('<textarea></textarea>'))).toBe(true);
    expect(isTyping(el('<input type="checkbox">'))).toBe(false);
    expect(isTyping(el('<button>Go</button>'))).toBe(false);
    expect(isTyping(el('<div role="combobox"></div>'))).toBe(true);
    expect(isTyping(null)).toBe(false);
  });
});
