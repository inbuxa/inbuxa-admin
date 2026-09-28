/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { verdict } from './usePort25Check';

describe('verdict', () => {
  it('is open once a mail server greets us', () => {
    expect(
      verdict([
        { type: 'deliveryAttemptStart', hostname: 'gmail-smtp-in.l.google.com' },
        { type: 'connectionStart', remoteIp: '1.2.3.4' },
        { type: 'connectionSuccess', elapsed: 20 },
        { type: 'readGreetingSuccess', elapsed: 40 },
      ]),
    ).toEqual({ kind: 'open', host: 'gmail-smtp-in.l.google.com' });
  });

  it('is blocked when every connection fails', () => {
    expect(
      verdict([
        { type: 'deliveryAttemptStart', hostname: 'mx1' },
        { type: 'connectionError', elapsed: 5000, reason: 'Connection timed out' },
        { type: 'deliveryAttemptStart', hostname: 'mx2' },
        { type: 'connectionError', elapsed: 5000, reason: 'Connection timed out' },
      ]),
    ).toEqual({ kind: 'blocked', reason: 'Connection timed out' });
  });

  it('cannot tell when the domain has no mail servers', () => {
    expect(verdict([{ type: 'mxLookupError', reason: 'NXDOMAIN', elapsed: 3 }]).kind).toBe('unknown');
  });
});
