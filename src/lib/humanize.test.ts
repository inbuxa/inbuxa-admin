/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { humanize } from './humanize';

describe('humanize', () => {
  it('spells out property names', () => {
    expect(humanize('defaultCertificateId')).toBe('Default certificate ID');
    expect(humanize('mailExchangers')).toBe('Mail exchangers');
    expect(humanize('proxyTrustedNetworks')).toBe('Proxy trusted networks');
    expect(humanize('maxConnections')).toBe('Max connections');
  });
  it('keeps acronyms', () => {
    expect(humanize('useHttpsForSmtp')).toBe('Use HTTPS for SMTP');
    expect(humanize('oauthClientId')).toBe('OAuth client ID');
    expect(humanize('DNSServer')).toBe('DNS server');
  });
  it('names views', () => {
    expect(humanize('x:SystemSettings')).toBe('System settings');
    expect(humanize('x:Account/User')).toBe('User');
  });
});
