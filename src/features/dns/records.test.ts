/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { DEFAULT_KINDS, RECORD_GROUPS } from './records';

describe('DEFAULT_KINDS', () => {
  it('leaves off the records that can break something else', () => {
    expect(DEFAULT_KINDS).not.toContain('tlsa');
    expect(DEFAULT_KINDS).not.toContain('caa');
    expect(DEFAULT_KINDS).toContain('dkim');
    expect(DEFAULT_KINDS).toContain('mx');
  });

  it('warns before CAA is switched on', () => {
    const caa = RECORD_GROUPS.flatMap((g) => g.kinds).find((k) => k.kind === 'caa');
    expect(caa?.caution).toMatch(/refused at its next renewal/);
  });
});
