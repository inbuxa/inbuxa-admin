/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** inbuxa: what the certificate guides share: loading, polling and name lookups. */

import { getAccountId, jmapQueryAndGet, jmapRequest, jmapSet } from '@/services/jmap/client';
import type { JmapSetResponse } from '@/types/jmap';
import { dohQuery } from '@/features/dns/liveCheck';
import { parseZone } from '@/features/dns/zone';
import type { Method, NameState } from './names';

export const LE_PRODUCTION = 'https://acme-v02.api.letsencrypt.org/directory';
export const LE_STAGING = 'https://acme-staging-v02.api.letsencrypt.org/directory';
export const CHALLENGE: Record<Method, string> = { dns: 'Dns01', tls: 'TlsAlpn01' };

export interface DomainRow {
  id: string;
  name: string;
  automatic: boolean;
  providerId?: string;
  /** The domain's own certificate hostnames, kept as they are when it's switched. */
  hostnames: string[];
  dnsAutomatic: boolean;
  zone: ReturnType<typeof parseZone>;
}

export interface ProviderRow {
  id: string;
  directory: string;
  challengeType: string;
  contact: string[];
}

export interface CertRow {
  id: string;
  sans: string[];
  notValidBefore: string;
  notValidAfter: string;
}

export interface Loaded {
  domains: DomainRow[];
  providers: ProviderRow[];
  certs: CertRow[];
  serverName: string;
  defaultCertificateId: string | null;
}

export type Check = { name: string; state: NameState | 'checking' | 'error'; addresses: string[] };

const keys = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object) : []);

export const certRow = (c: Record<string, unknown>): CertRow => ({
  id: String(c.id),
  sans: keys(c.subjectAlternativeNames).map((s) => s.toLowerCase()),
  notValidBefore: String(c.notValidBefore ?? ''),
  notValidAfter: String(c.notValidAfter ?? ''),
});

export async function load(): Promise<Loaded> {
  const get = (obj: string, args: Record<string, unknown>, id: string) =>
    [`${obj}/get`, { accountId: getAccountId(obj), ...args }, id] as [string, Record<string, unknown>, string];
  const res = await jmapRequest([
    get('x:Domain', { ids: null, properties: ['name', 'certificateManagement', 'dnsManagement', 'dnsZoneFile'] }, 'd'),
    get('x:AcmeProvider', { ids: null, properties: ['directory', 'challengeType', 'contact'] }, 'p'),
    get(
      'x:Certificate',
      { ids: null, properties: ['subjectAlternativeNames', 'notValidBefore', 'notValidAfter'] },
      'c',
    ),
    get('x:SystemSettings', { ids: ['singleton'], properties: ['defaultHostname', 'defaultCertificateId'] }, 's'),
  ]);
  const list = (id: string) =>
    (res.find(([, , i]) => i === id)?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? [];
  return {
    domains: list('d')
      .map((d) => {
        const cm = (d.certificateManagement ?? {}) as Record<string, unknown>;
        const dm = (d.dnsManagement ?? {}) as Record<string, unknown>;
        return {
          id: String(d.id),
          name: String(d.name),
          automatic: cm['@type'] === 'Automatic',
          providerId: cm.acmeProviderId as string | undefined,
          hostnames: cm['@type'] === 'Automatic' ? keys(cm.subjectAlternativeNames) : [],
          dnsAutomatic: dm['@type'] === 'Automatic',
          zone: parseZone(d.dnsZoneFile as string | undefined),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    providers: list('p').map((p) => ({
      id: String(p.id),
      directory: String(p.directory ?? ''),
      challengeType: String(p.challengeType ?? ''),
      contact: keys(p.contact).map((c) => c.replace(/^mailto:/, '')),
    })),
    certs: list('c').map(certRow),
    serverName: String(list('s')[0]?.defaultHostname ?? ''),
    defaultCertificateId: (list('s')[0]?.defaultCertificateId as string | undefined) ?? null,
  };
}

/** The newest certificate covering every one of these names. */
export function coveringCert(certs: CertRow[], names: string[]): CertRow | undefined {
  return certs
    .filter((c) => names.every((n) => c.sans.includes(n.toLowerCase())))
    .sort((a, b) => b.notValidAfter.localeCompare(a.notValidAfter))[0];
}

/** The newest certificate covering any of these names: what the domain uses today. */
export function currentCert(certs: CertRow[], names: string[]): CertRow | undefined {
  return certs
    .filter((c) => names.some((n) => c.sans.includes(n.toLowerCase())))
    .sort((a, b) => b.notValidAfter.localeCompare(a.notValidAfter))[0];
}

export async function resolveAddresses(name: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA']) {
    const r = await dohQuery(name.replace(/^\*\./, ''), type);
    out.push(...r.answer.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data));
  }
  return out;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Every certificate and every certificate renewal task, for watching orders. */
export async function pollOrders(): Promise<{ certs: CertRow[]; tasks: Record<string, unknown>[]; at: number }> {
  const [certRes] = await jmapRequest([
    [
      'x:Certificate/get',
      {
        accountId: getAccountId('x:Certificate'),
        ids: null,
        properties: ['subjectAlternativeNames', 'notValidBefore', 'notValidAfter'],
      },
      'c',
    ],
  ]);
  const [, taskRes] = await jmapQueryAndGet('x:Task', getAccountId('x:Task'), { filter: { '@type': 'AcmeRenewal' } }, [
    '@type',
    'domainId',
    'status',
    'due',
  ]);
  const certs = (((certRes?.[1] as { list?: Record<string, unknown>[] })?.list ?? []) as Record<string, unknown>[]).map(
    certRow,
  );
  const tasks = (
    ((taskRes?.[1] as { list?: Record<string, unknown>[] })?.list ?? []) as Record<string, unknown>[]
  ).filter((x) => x['@type'] === 'AcmeRenewal');
  return { certs, tasks, at: Date.now() };
}

/** Adds a Let’s Encrypt account for one way of checking names, and returns its id. */
export async function addProvider(method: Method, contact: string, staging: boolean): Promise<string> {
  const [res] = await jmapSet('x:AcmeProvider', getAccountId('x:AcmeProvider'), {
    create: {
      acme: {
        directory: staging ? LE_STAGING : LE_PRODUCTION,
        challengeType: CHALLENGE[method],
        contact: { [contact.trim()]: true },
        description: `${staging ? 'Let’s Encrypt (staging)' : 'Let’s Encrypt'}, ${method === 'dns' ? 'DNS-01' : 'TLS-ALPN-01'}, ${contact.trim()}`,
      },
    },
  });
  const body = res?.[1] as unknown as JmapSetResponse | undefined;
  const id = (body?.created?.acme as { id?: string } | undefined)?.id;
  if (!id) {
    const e = body?.notCreated ? Object.values(body.notCreated)[0] : undefined;
    throw new Error(e?.description ?? e?.type ?? 'The Let’s Encrypt account could not be added.');
  }
  return id;
}

/** The first refusal in a set response, as an error message, or null when nothing was refused. */
export function refusal(res: unknown, fallback: string): string | null {
  const body = res as JmapSetResponse | undefined;
  const e = [body?.notCreated, body?.notUpdated, body?.notDestroyed]
    .flatMap((m) => (m ? Object.values(m) : []))
    .find(Boolean);
  return e ? (e.description ?? e.type ?? fallback) : null;
}
