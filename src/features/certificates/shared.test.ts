/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { challengeOf, defaultDirect, LE_PRODUCTION, LE_STAGING, PORT, providerFor, type ProviderRow } from './shared';

const row = (id: string, challengeType: string, directory = LE_PRODUCTION): ProviderRow => ({
  id,
  directory,
  challengeType,
  contact: [],
});

describe('certificate accounts (#206)', () => {
  it('prefers port 80 when the server has an HTTP-01 account, as an installer setup does', () => {
    expect(defaultDirect([row('a', 'Http01')])).toBe('Http01');
    expect(defaultDirect([row('a', 'TlsAlpn01'), row('b', 'Http01', LE_STAGING)])).toBe('Http01');
    expect(defaultDirect([row('a', 'TlsAlpn01'), row('b', 'Dns01')])).toBe('TlsAlpn01');
    expect(defaultDirect([])).toBe('TlsAlpn01');
    expect(PORT.Http01).toBe(80);
    expect(PORT.TlsAlpn01).toBe(443);
  });

  it('reuses the installer’s HTTP-01 account instead of adding one', () => {
    const providers = [row('installer', 'Http01'), row('dns', 'Dns01')];
    expect(providerFor(providers, LE_PRODUCTION, 'tls', 'Http01')?.id).toBe('installer');
    expect(providerFor(providers, LE_PRODUCTION, 'dns', 'Http01')?.id).toBe('dns');
    // Port 443 picked: an HTTP-01 account doesn't do, so one is added.
    expect(providerFor(providers, LE_PRODUCTION, 'tls', 'TlsAlpn01')).toBeUndefined();
    // Staging is its own account.
    expect(providerFor(providers, LE_STAGING, 'tls', 'Http01')).toBeUndefined();
  });

  it('asks for the challenge that matches the way names are checked', () => {
    expect(challengeOf('dns', 'Http01')).toBe('Dns01');
    expect(challengeOf('tls', 'Http01')).toBe('Http01');
    expect(challengeOf('tls', 'TlsAlpn01')).toBe('TlsAlpn01');
  });
});
