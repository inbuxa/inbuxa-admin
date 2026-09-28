/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { SETTINGS_CATEGORIES } from '@/lib/settingsLayout';
import { PAGE_HELP, pageAbout } from './texts';

describe('settings page intros', () => {
  it('every Settings page has one sentence of our own', () => {
    const pages = SETTINGS_CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.pages.map((p) => p.viewName))).filter(
      (v) => !v.startsWith('CustomComponent/'),
    );
    const missing = pages.filter((v) => !PAGE_HELP[v]?.about);
    expect(missing).toEqual([]);
  });

  it('are short enough for a page heading', () => {
    for (const [view, help] of Object.entries(PAGE_HELP)) {
      expect(help.about.length, view).toBeLessThanOrEqual(130);
    }
  });

  it('fall back to the schema where we have none', () => {
    expect(pageAbout('x:SenderAuth', 'schema text')).not.toBe('schema text');
    expect(pageAbout('x:Nothing', 'schema text')).toBe('schema text');
  });
});
