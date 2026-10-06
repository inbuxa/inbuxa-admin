/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { providerForNameservers } from './detect';

describe('providerForNameservers', () => {
  it('knows the big hosts', () => {
    expect(providerForNameservers(['dean.ns.cloudflare.com', 'gina.ns.cloudflare.com.'])).toBe('Cloudflare');
    expect(providerForNameservers(['ns-421.awsdns-52.com', 'ns-1707.awsdns-21.co.uk'])).toBe('Route53');
    expect(providerForNameservers(['ns-cloud-a1.googledomains.com'])).toBe('GoogleCloudDns');
    expect(providerForNameservers(['ns1-01.azure-dns.com', 'ns2-01.azure-dns.net'])).toBe('AzureDns');
    expect(providerForNameservers(['ns1.digitalocean.com'])).toBe('DigitalOcean');
    expect(providerForNameservers(['hydrogen.ns.hetzner.com', 'helium.ns.hetzner.de'])).toBe('Hetzner');
    expect(providerForNameservers(['ns01.domaincontrol.com'])).toBe('Godaddy');
    expect(providerForNameservers(['dns1.gandi.net', 'e.gandi-ns.fr'])).toBe('GandiV5');
  });

  it('refuses to guess for split or unknown hosting', () => {
    expect(providerForNameservers(['dns1.p08.nsone.net', 'ns-421.awsdns-52.com'])).toBeNull();
    expect(providerForNameservers(['ns1.example-hosting.net'])).toBeNull();
    expect(providerForNameservers(['dean.ns.cloudflare.com', 'ns1.example-hosting.net'])).toBeNull();
    expect(providerForNameservers([])).toBeNull();
  });
});
