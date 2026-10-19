/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { Circle, Server, SlidersHorizontal } from 'lucide-react';
import { iconByName } from './iconByName';

describe('iconByName', () => {
  it('finds an icon by its kebab-case name', () => {
    expect(iconByName('server')).toBe(Server);
    expect(iconByName('sliders-horizontal')).toBe(SlidersHorizontal);
  });

  it('falls back to a circle', () => {
    expect(iconByName('no-such-icon')).toBe(Circle);
    expect(iconByName('')).toBe(Circle);
  });
});
