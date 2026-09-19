/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it } from 'vitest';
import { manualUrl } from './manual';
import { fieldHelp, FIELD_HELP } from './texts';

describe('manualUrl', () => {
  afterEach(() => document.querySelector('meta[name="manual-url"]')?.remove());

  it('shows no link until a manual is configured', () => {
    expect(manualUrl('x:Domain.dnsManagement')).toBeNull();
  });

  it('maps help ids to stable manual pages and anchors', () => {
    const meta = document.createElement('meta');
    meta.name = 'manual-url';
    meta.content = 'https://docs.example.org/admin/';
    document.head.appendChild(meta);
    expect(manualUrl('x:Domain')).toBe('https://docs.example.org/admin/reference/domain/');
    expect(manualUrl('x:Domain.dnsManagement')).toBe('https://docs.example.org/admin/reference/domain/#dnsmanagement');
    expect(manualUrl('x:DnsServerCloudflare.secret')).toBe(
      'https://docs.example.org/admin/reference/dns-server-cloudflare/#secret',
    );
    expect(manualUrl('x:Account/User')).toBe('https://docs.example.org/admin/reference/account-user/');
  });
});

describe('fieldHelp', () => {
  it('prefers our words, then the schema description', () => {
    expect(fieldHelp('x:Domain.catchAllAddress', 'schema text')).toBe(FIELD_HELP['x:Domain.catchAllAddress']);
    expect(fieldHelp('x:Domain.unknownField', 'schema text')).toBe('schema text');
    expect(fieldHelp(undefined, null)).toBeNull();
  });
});
