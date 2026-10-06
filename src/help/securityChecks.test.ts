/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { evaluate, type Part } from '@/features/security/checks';
import { SECURITY_CHECK_HELP } from './securityChecks';

const PARTS: Part[] = [
  'imap',
  'rcpt',
  'auth',
  'certificates',
  'security',
  'http',
  'oidc',
  'authentication',
  'tlsStrategies',
  'senderAuth',
  'metrics',
  'mtaSts',
  'domains',
  'dns',
  'legacy',
];

describe('security page help', () => {
  it('explains every check the page runs, once, in order', () => {
    // With nothing readable, every check reports itself as not checked
    const unavailable = Object.fromEntries(PARTS.map((p) => [p, 'x']));
    const { passed } = evaluate({ now: 0, unavailable }, () => undefined);
    const byNumber = (a: string, b: string) => Number(a.slice(3)) - Number(b.slice(3));
    expect(SECURITY_CHECK_HELP.map((c) => c.check)).toEqual(passed.map((p) => p.check).sort(byNumber));
  });
});
