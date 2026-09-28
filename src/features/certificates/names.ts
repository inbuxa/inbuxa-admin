/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: which names a certificate order asks for, and whether each one
 * reaches this server (settings-reorg, guided setup 2).
 *
 * The server decides the names (common/src/network/acme/order.rs): with DNS
 * validation it asks for the domain and a wildcard under it; otherwise for
 * mta-sts, ua-auto-config, autoconfig and autodiscover under the domain, plus
 * the server's own name when it's inside the domain. Every name must pass, or
 * the whole order fails and keeps retrying, so the guide checks them first.
 */

import type { ZoneRecord } from '@/features/dns/zone';

export type Method = 'dns' | 'tls';

export const TECHNICAL_NAMES = ['mta-sts', 'ua-auto-config', 'autoconfig', 'autodiscover'];

function inZone(name: string, domain: string): boolean {
  return name === domain || name.endsWith(`.${domain}`);
}

export function orderNames(domain: string, method: Method, serverName: string, zone: ZoneRecord[] = []): string[] {
  const d = domain.toLowerCase();
  if (method === 'dns') return [`*.${d}`, d];
  const names = new Set(TECHNICAL_NAMES.map((h) => `${h}.${d}`));
  const host = serverName.toLowerCase().replace(/\.$/, '');
  if (host && inZone(host, d)) names.add(host);
  for (const r of zone) {
    if (r.type !== 'MX') continue;
    const target = r.value.split(/\s+/).pop()?.toLowerCase().replace(/\.$/, '');
    if (target && inZone(target, d)) names.add(target);
  }
  return [...names].sort();
}

// Cloudflare's published proxy ranges (cloudflare.com/ips). A name that
// answers with one of these is orange-clouded: TLS-ALPN validation can't
// reach this server through the proxy.
const CF_V4 = [
  '173.245.48.0/20',
  '103.21.244.0/22',
  '103.22.200.0/22',
  '103.31.4.0/22',
  '141.101.64.0/18',
  '108.162.192.0/18',
  '190.93.240.0/20',
  '188.114.96.0/20',
  '197.234.240.0/22',
  '198.41.128.0/17',
  '162.158.0.0/15',
  '104.16.0.0/13',
  '104.24.0.0/14',
  '172.64.0.0/13',
  '131.0.72.0/22',
];
const CF_V6 = ['2400:cb00:', '2606:4700:', '2803:f800:', '2405:b500:', '2405:8100:', '2a06:98c', '2c0f:f248:'];

function v4ToInt(ip: string): number | null {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

export function isCloudflareProxy(ip: string): boolean {
  if (ip.includes(':')) return CF_V6.some((p) => ip.toLowerCase().startsWith(p));
  const n = v4ToInt(ip);
  if (n === null) return false;
  return CF_V4.some((cidr) => {
    const [base, bits] = cidr.split('/');
    const b = v4ToInt(base)!;
    const mask = bits === '0' ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (n & mask) >>> 0 === (b & mask) >>> 0;
  });
}

export type NameState = 'ok' | 'proxied' | 'elsewhere' | 'missing';

/** Where a name points, against where this server is. */
export function classify(addresses: string[], serverAddresses: string[]): NameState {
  if (addresses.length === 0) return 'missing';
  const mine = new Set(serverAddresses.map((a) => a.toLowerCase()));
  if (addresses.some((a) => mine.has(a.toLowerCase()))) return 'ok';
  if (addresses.some(isCloudflareProxy)) return 'proxied';
  return 'elsewhere';
}
