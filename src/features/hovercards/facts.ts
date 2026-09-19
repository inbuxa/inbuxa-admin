/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * What a hover card shows, fetched when the card opens and kept for a
 * minute, so moving across a list doesn't ask the server twice.
 */
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { parseZone, type RecordKind, type ZoneRecord } from '@/features/dns/zone';
import { checkRecords } from '@/features/dns/liveCheck';

export interface DomainFacts {
  kind: 'domain';
  name: string;
  enabled: boolean;
  people?: number;
  dns: string;
  dkim: string;
  certs: string;
  /** The core records, and which are live in public DNS. */
  checks: { kind: RecordKind; live: boolean }[];
}

export interface PersonFacts {
  kind: 'person';
  address: string;
  name?: string;
  used: number;
  quota: number | null;
  role?: string;
  groups: number;
  createdAt?: string;
}

export type CardFacts = DomainFacts | PersonFacts;

/** The records a domain can't work without, in the order the card lists them. */
export const CORE_KINDS: RecordKind[] = ['mx', 'spf', 'dkim', 'dmarc'];

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; facts: Promise<CardFacts | null> }>();

function mode(value: unknown): string {
  return ((value as { '@type'?: string } | undefined)?.['@type'] ?? 'Manual').toString();
}

/** Of the domain's core records, which are live. Kinds with no records (DKIM before keys exist) are left out. */
export async function coreChecks(zone: ZoneRecord[], domain: string): Promise<{ kind: RecordKind; live: boolean }[]> {
  const apex = domain.toLowerCase();
  const core = zone.filter((r) => CORE_KINDS.includes(r.kind) && (r.kind !== 'spf' || r.name.toLowerCase() === apex));
  const states = await checkRecords(core);
  return CORE_KINDS.filter((k) => core.some((r) => r.kind === k)).map((kind) => ({
    kind,
    live: core.filter((r) => r.kind === kind).every((r) => states.get(r) === 'live'),
  }));
}

async function domainFacts(id: string): Promise<DomainFacts | null> {
  const accountId = getAccountId('x:Domain');
  const responses = await jmapRequest([
    [
      'x:Domain/get',
      {
        accountId,
        ids: [id],
        properties: ['name', 'isEnabled', 'dnsManagement', 'dkimManagement', 'certificateManagement', 'dnsZoneFile'],
      },
      'd',
    ],
    [
      'x:Account/query',
      { accountId: getAccountId('x:Account'), filter: { domainId: id }, limit: 1, calculateTotal: true },
      'n',
    ],
  ]);
  const d = (responses.find((r) => r[2] === 'd')?.[1] as { list?: Record<string, unknown>[] })?.list?.[0];
  if (!d) return null;
  const count = responses.find((r) => r[2] === 'n' && r[0] !== 'error')?.[1] as { total?: number } | undefined;
  const name = String(d.name);
  const checks = await coreChecks(parseZone(d.dnsZoneFile as string | undefined), name).catch(
    (): DomainFacts['checks'] => [],
  );
  return {
    kind: 'domain',
    name,
    enabled: d.isEnabled !== false,
    people: count?.total,
    dns: mode(d.dnsManagement),
    dkim: mode(d.dkimManagement),
    certs: mode(d.certificateManagement),
    checks,
  };
}

async function personFacts(id: string): Promise<PersonFacts | null> {
  const responses = await jmapRequest([
    [
      'x:Account/get',
      {
        accountId: getAccountId('x:Account'),
        ids: [id],
        properties: [
          '@type',
          'emailAddress',
          'name',
          'description',
          'usedDiskQuota',
          'quotas',
          'roles',
          'memberGroupIds',
          'createdAt',
        ],
      },
      'a',
    ],
  ]);
  const a = (responses[0]?.[1] as { list?: Record<string, unknown>[] })?.list?.[0];
  if (!a) return null;
  const quotas = (a.quotas ?? {}) as Record<string, unknown>;
  const quota = typeof quotas.maxDiskQuota === 'number' && quotas.maxDiskQuota > 0 ? quotas.maxDiskQuota : null;
  const groups = a.memberGroupIds && typeof a.memberGroupIds === 'object' ? Object.keys(a.memberGroupIds).length : 0;
  return {
    kind: 'person',
    address: String(a.emailAddress ?? a.name ?? id),
    name: typeof a.description === 'string' && a.description.trim() ? a.description.trim() : undefined,
    used: typeof a.usedDiskQuota === 'number' ? a.usedDiskQuota : 0,
    quota,
    role: (a.roles as { '@type'?: string } | undefined)?.['@type'],
    groups,
    createdAt: typeof a.createdAt === 'string' ? a.createdAt : undefined,
  };
}

/** Object types that have a hover card. */
export const CARD_OBJECTS = new Set(['x:Domain', 'x:Account']);

export function loadCardFacts(objectName: string, id: string): Promise<CardFacts | null> {
  const key = `${objectName}|${id}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.facts;
  const facts = (objectName === 'x:Domain' ? domainFacts(id) : personFacts(id)).catch(() => null);
  cache.set(key, { at: Date.now(), facts });
  return facts;
}
