/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * What a hover card shows, fetched when the card opens and kept for a
 * minute, so moving across a list doesn't ask the server twice.
 */
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { parseZone, type RecordKind, type ZoneRecord } from '@/features/dns/zone';
import { checkRecordValues, type LiveResult } from '@/features/dns/liveCheck';
import i18n from '@/i18n';
import { useAccountStore } from '@/stores/accountStore';
import { fetchReports, fetchSettings } from '@/features/deliverability/api';
import { grade, worstFor } from '@/features/deliverability/grade';

export interface DomainFacts {
  kind: 'domain';
  name: string;
  enabled: boolean;
  people?: number;
  dns: string;
  dkim: string;
  certs: string;
  /** The core records, and which are live in public DNS. */
  checks: CoreCheck[];
  /** inbuxa: DL-19, the domain's worst deliverability failure, if any. */
  deliverability?: string;
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

/**
 * Where a core record stands in public DNS:
 * - `live`: exactly what the server suggests is published;
 * - `valid`: a DMARC or SPF record of the domain's own is published instead, and it is well formed (#236);
 * - `different`: something else is published (MX elsewhere, another DKIM key, two SPF records);
 * - `missing`: nothing is;
 * - `error`: public DNS couldn't be asked.
 */
export type CoreState = 'live' | 'valid' | 'different' | 'missing' | 'error';

export interface CoreCheck {
  kind: RecordKind;
  state: CoreState;
  /** Published and usable: `live` or `valid`. */
  live: boolean;
}

const DMARC_RECORD = /^v=DMARC1\s*(;|$)/i;
const DMARC_POLICY = /;\s*p\s*=\s*(none|quarantine|reject)\s*(;|$)/i;
const SPF_RECORD = /^v=spf1(\s|$)/i;

/** One kind's state, from each of its suggested records' results. */
export function coreState(kind: RecordKind, results: LiveResult[]): CoreState {
  if (results.some((r) => r.state === 'error')) return 'error';
  if (results.every((r) => r.state === 'live')) return 'live';
  if (kind === 'dmarc' || kind === 'spf') {
    // The name may hold other TXT records (site verifications); only the ones of this kind count.
    const own = [...new Set(results.flatMap((r) => r.found))].filter((v) =>
      (kind === 'dmarc' ? DMARC_RECORD : SPF_RECORD).test(v),
    );
    if (own.length === 0) return 'missing';
    // More than one is a permanent error for receivers, so only a single well-formed one passes.
    if (own.length === 1 && (kind === 'spf' || DMARC_POLICY.test(own[0]))) return 'valid';
    return 'different';
  }
  return results.some((r) => r.state === 'missing') ? 'missing' : 'different';
}

/** Of the domain's core records, where each kind stands. Kinds with no records (DKIM before keys exist) are left out. */
export async function coreChecks(zone: ZoneRecord[], domain: string): Promise<CoreCheck[]> {
  const apex = domain.toLowerCase();
  const core = zone.filter((r) => CORE_KINDS.includes(r.kind) && (r.kind !== 'spf' || r.name.toLowerCase() === apex));
  const results = await checkRecordValues(core);
  return CORE_KINDS.filter((k) => core.some((r) => r.kind === k)).map((kind) => {
    const state = coreState(
      kind,
      core.filter((r) => r.kind === kind).map((r) => results.get(r) ?? { state: 'error', found: [] }),
    );
    return { kind, state, live: state === 'live' || state === 'valid' };
  });
}

/** DL-19: the worst failing deliverability finding for a domain, for whoever may read the reports. */
async function deliverabilityFor(domain: string): Promise<string | undefined> {
  if (!useAccountStore.getState().hasObjectPermission('sysDeliverability', 'Get')) return undefined;
  const [reports, settings] = await Promise.all([fetchReports(), fetchSettings()]);
  const t = i18n.t.bind(i18n) as (key: string, fallback: string, options?: Record<string, unknown>) => string;
  return worstFor(grade(reports, settings.lists, t), domain.toLowerCase())?.title;
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
  const [checks, deliverability] = await Promise.all([
    coreChecks(parseZone(d.dnsZoneFile as string | undefined), name).catch((): DomainFacts['checks'] => []),
    deliverabilityFor(name).catch(() => undefined),
  ]);
  return {
    kind: 'domain',
    name,
    enabled: d.isEnabled !== false,
    people: count?.total,
    dns: mode(d.dnsManagement),
    dkim: mode(d.dkimManagement),
    certs: mode(d.certificateManagement),
    checks,
    deliverability,
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
