/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { classify, encryptionWords, listenerFor, portOf, SERVICES } from './services';

describe('ports', () => {
  it('reads ports from socket addresses', () => {
    expect(portOf('[::]:25')).toBe(25);
    expect(portOf('0.0.0.0:587')).toBe(587);
    expect(portOf('localhost')).toBeNull();
  });

  it('sorts listeners into services by protocol and port, and keeps the rest as custom', () => {
    const { byService, custom } = classify([
      { id: 'a', protocol: 'smtp', bind: { '[::]:25': true } },
      { id: 'b', protocol: 'smtp', bind: { '[::]:465': true }, tlsImplicit: true },
      { id: 'c', protocol: 'http', bind: { '[::]:443': true, '0.0.0.0:443': true }, tlsImplicit: true },
      { id: 'd', protocol: 'http', bind: { '127.0.0.1:8080': true } },
      { id: 'e', protocol: 'imap', bind: { '[::]:25': true } },
    ]);
    expect(byService.get('smtp')?.map((l) => l.id)).toEqual(['a']);
    expect(byService.get('submissions')?.map((l) => l.id)).toEqual(['b']);
    expect(byService.get('https')?.map((l) => l.id)).toEqual(['c']);
    expect(custom.map((l) => l.id)).toEqual(['d', 'e']);
  });

  it('makes a listener for a service', () => {
    const s = SERVICES.find((x) => x.id === 'submissions')!;
    expect(listenerFor(s)).toEqual({
      name: 'submissions',
      protocol: 'smtp',
      bind: { '[::]:465': true },
      tlsImplicit: true,
      useTls: true,
    });
  });

  it('names the encryption', () => {
    expect(encryptionWords({ tlsImplicit: true })).toBe('encrypted from the start');
    expect(encryptionWords({ useTls: true })).toBe('STARTTLS');
    expect(encryptionWords({ useTls: false })).toBe('not encrypted');
  });
});
