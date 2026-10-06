/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { classify, isCloudflareProxy, orderNames } from './names';

describe('orderNames', () => {
  it('asks for the domain and a wildcard with DNS validation', () => {
    expect(orderNames('Example.com', 'dns', 'mail.example.com')).toEqual(['*.example.com', 'example.com']);
  });

  it('asks for the technical names, the server name and MX hosts in the domain otherwise', () => {
    const zone = [
      { name: 'example.com.', type: 'MX', value: '10 mx.example.com.', kind: 'mx' as const },
      { name: 'example.com.', type: 'MX', value: '20 mx.other.net.', kind: 'mx' as const },
    ];
    expect(orderNames('example.com', 'tls', 'mail.example.com', zone)).toEqual([
      'autoconfig.example.com',
      'autodiscover.example.com',
      'mail.example.com',
      'mta-sts.example.com',
      'mx.example.com',
      'ua-auto-config.example.com',
    ]);
  });

  it('leaves out a server name in another domain', () => {
    expect(orderNames('example.com', 'tls', 'mail.other.net')).not.toContain('mail.other.net');
  });
});

describe('classify', () => {
  it('knows a name that reaches this server', () => {
    expect(classify(['157.180.98.170'], ['157.180.98.170', '2a01::25'])).toBe('ok');
  });
  it('spots the Cloudflare proxy', () => {
    expect(isCloudflareProxy('104.21.3.4')).toBe(true);
    expect(isCloudflareProxy('172.67.1.1')).toBe(true);
    expect(isCloudflareProxy('2606:4700:3030::1')).toBe(true);
    expect(isCloudflareProxy('157.180.98.170')).toBe(false);
    expect(classify(['104.21.3.4'], ['157.180.98.170'])).toBe('proxied');
  });
  it('tells missing from elsewhere', () => {
    expect(classify([], ['1.2.3.4'])).toBe('missing');
    expect(classify(['5.6.7.8'], ['1.2.3.4'])).toBe('elsewhere');
  });
});
