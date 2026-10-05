/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { effectiveSwitch, type SharingPolicy } from './sharingPolicy';

const p = (mailSharing: 'enabled' | 'disabled', addAccounts: 'enabled' | 'disabled' = 'enabled'): SharingPolicy => ({
  id: 'x',
  mailSharing,
  addAccounts,
});

describe('effectiveSwitch (MA-C)', () => {
  it('is off when either level has it off: a tenant is only ever stricter', () => {
    expect(effectiveSwitch(p('enabled'), undefined, 'mailSharing')).toBe('enabled');
    expect(effectiveSwitch(p('enabled'), p('disabled'), 'mailSharing')).toBe('disabled');
    expect(effectiveSwitch(p('disabled'), p('enabled'), 'mailSharing')).toBe('disabled');
    expect(effectiveSwitch(p('enabled', 'disabled'), p('enabled'), 'addAccounts')).toBe('disabled');
  });
});
