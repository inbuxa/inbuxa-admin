/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { challengeOf, defaultDirect, PORT } from './direct';

describe('certificate accounts (#206)', () => {
  it('prefers port 80 when the server has an HTTP-01 account, as an installer setup does', () => {
    expect(defaultDirect([{ challengeType: 'Http01' }])).toBe('Http01');
    expect(defaultDirect([{ challengeType: 'TlsAlpn01' }, { challengeType: 'Http01' }])).toBe('Http01');
    expect(defaultDirect([{ challengeType: 'TlsAlpn01' }, { challengeType: 'Dns01' }])).toBe('TlsAlpn01');
    expect(defaultDirect([])).toBe('TlsAlpn01');
    expect(PORT.Http01).toBe(80);
    expect(PORT.TlsAlpn01).toBe(443);
  });

  it('asks for the challenge that matches the way names are checked', () => {
    expect(challengeOf('dns', 'Http01')).toBe('Dns01');
    expect(challengeOf('tls', 'Http01')).toBe('Http01');
    expect(challengeOf('tls', 'TlsAlpn01')).toBe('TlsAlpn01');
  });
});
