/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { parseKeepForDays, validDays } from './logSettings';

describe('log settings', () => {
  it('reads null as keep every file', () => {
    expect(parseKeepForDays({ keepForDays: null })).toBeNull();
    expect(parseKeepForDays({})).toBeNull();
    expect(parseKeepForDays({ keepForDays: 30 })).toBe(30);
  });

  it('takes whole days, at least one', () => {
    expect(validDays('30')).toBe(true);
    expect(validDays('1')).toBe(true);
    expect(validDays('0')).toBe(false);
    expect(validDays('1.5')).toBe(false);
    expect(validDays('')).toBe(false);
    expect(validDays('-3')).toBe(false);
  });
});
