/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what the security checks read, loaded when the page opens (SS-28):
 * one JMAP request for the settings, public DNS for each domain, and the
 * legacy-protocols switch. A part that can't be read is marked with why, so
 * its checks show as "not checked" rather than as passed or failed (SS-29).
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapMethodCall } from '@/types/jmap';
import { coreChecks } from '@/features/hovercards/facts';
import { parseZone } from '@/features/dns/zone';
import { dohQuery } from '@/features/dns/liveCheck';
import { fetchProtocolPolicy, SWITCHED } from '@/features/hardening/protocolPolicy';
import type { DomainSnapshot, Part, Snapshot } from './checks';

interface Call {
  part: Part;
  method: string;
  ids: string[] | null;
  properties: string[];
}

const CALLS: Call[] = [
  { part: 'imap', method: 'x:Imap/get', ids: ['singleton'], properties: ['allowPlainTextAuth'] },
  { part: 'rcpt', method: 'x:MtaStageRcpt/get', ids: ['singleton'], properties: ['allowRelaying'] },
  { part: 'auth', method: 'x:MtaStageAuth/get', ids: ['singleton'], properties: ['require'] },
  {
    part: 'certificates',
    method: 'x:Certificate/get',
    ids: null,
    properties: ['subjectAlternativeNames', 'notValidAfter'],
  },
  {
    part: 'security',
    method: 'x:Security/get',
    ids: ['singleton'],
    properties: ['authBanRate', 'abuseBanRate', 'scanBanRate'],
  },
  { part: 'http', method: 'x:Http/get', ids: ['singleton'], properties: ['rateLimitAnonymous'] },
  {
    part: 'oidc',
    method: 'x:OidcProvider/get',
    ids: ['singleton'],
    properties: ['anonymousClientRegistration', 'requireClientRegistration'],
  },
  {
    part: 'authentication',
    method: 'x:Authentication/get',
    ids: ['singleton'],
    properties: ['passwordMinStrength', 'passwordMinLength', 'passwordHashAlgorithm'],
  },
  {
    part: 'tlsStrategies',
    method: 'x:MtaTlsStrategy/get',
    ids: null,
    properties: ['name', 'allowInvalidCerts'],
  },
  { part: 'senderAuth', method: 'x:SenderAuth/get', ids: ['singleton'], properties: ['dmarcVerify'] },
  { part: 'metrics', method: 'x:Metrics/get', ids: ['singleton'], properties: ['prometheus'] },
  { part: 'mtaSts', method: 'x:MtaSts/get', ids: ['singleton'], properties: ['mode'] },
  {
    part: 'domains',
    method: 'x:Domain/get',
    ids: null,
    properties: ['name', 'isEnabled', 'allowRelaying', 'dnsZoneFile'],
  },
];

/** Why a call failed, in words. */
function reasonOf(body: unknown): string {
  const b = body as { type?: string; description?: string } | undefined;
  if (b?.type === 'forbidden') return 'No permission to read it';
  return b?.description ?? b?.type ?? 'The server didn’t answer';
}

/** The live DMARC policy of a domain: none, quarantine, reject, or null when there's no record. */
export function dmarcPolicyOf(txt: string[]): string | null {
  const record = txt
    .map((t) => t.replace(/^"|"$/g, '').replace(/"\s*"/g, ''))
    .find((t) => /^v=DMARC1\b/i.test(t.trim()));
  if (!record) return null;
  const p = /(?:^|;)\s*p\s*=\s*([a-z]+)/i.exec(record);
  return p ? p[1].toLowerCase() : null;
}

const DNS_TTL_MS = 60_000;
const dnsCache = new Map<string, { at: number; result: Promise<Pick<DomainSnapshot, 'missing' | 'dmarcPolicy'>> }>();

/** A domain's DNS, kept for a minute as the hover cards keep theirs (SS-28), so a Fix doesn't ask again. */
function domainDns(
  name: string,
  zoneFile: string | undefined,
): Promise<Pick<DomainSnapshot, 'missing' | 'dmarcPolicy'>> {
  const key = `${name}\n${zoneFile ?? ''}`;
  const hit = dnsCache.get(key);
  if (hit && Date.now() - hit.at < DNS_TTL_MS) return hit.result;
  const result = askDns(name, zoneFile);
  dnsCache.set(key, { at: Date.now(), result });
  result.catch(() => dnsCache.delete(key));
  return result;
}

async function askDns(
  name: string,
  zoneFile: string | undefined,
): Promise<Pick<DomainSnapshot, 'missing' | 'dmarcPolicy'>> {
  const [checks, dmarc] = await Promise.all([coreChecks(parseZone(zoneFile), name), dohQuery(`_dmarc.${name}`, 'TXT')]);
  return {
    missing: checks.filter((c) => !c.live).map((c) => c.kind),
    dmarcPolicy: dmarcPolicyOf(dmarc.answer.filter((a) => a.type === 16).map((a) => a.data)),
  };
}

/** The parts the critical checks (SS-1 to SS-5) read: enough for the dashboard's line (SS-27). */
const CRITICAL_PARTS: Part[] = ['imap', 'rcpt', 'auth', 'certificates', 'domains'];

/**
 * What the checks read. `critical` loads only what SS-1 to SS-5 need, with
 * no DNS and no legacy switch, for the dashboard.
 */
export async function loadSnapshot(signal?: AbortSignal, critical = false): Promise<Snapshot> {
  const accountId = getAccountId('x:Imap');
  const wanted = critical ? CALLS.filter((c) => CRITICAL_PARTS.includes(c.part)) : CALLS;
  const calls: JmapMethodCall[] = wanted.map((c, i) => [
    c.method,
    { accountId, ids: c.ids, properties: c.properties },
    String(i),
  ]);
  const responses = await jmapRequest(calls, signal);
  const snapshot: Snapshot = { now: Date.now(), unavailable: {} };
  const lists: Partial<Record<Part, Record<string, unknown>[]>> = {};

  wanted.forEach((c, i) => {
    const response = responses.find((r) => r[2] === String(i));
    if (!response || response[0] === 'error') {
      snapshot.unavailable[c.part] = reasonOf(response?.[1]);
      return;
    }
    lists[c.part] = ((response[1] as { list?: Record<string, unknown>[] }).list ?? []) as Record<string, unknown>[];
  });

  const one = (part: Part) => lists[part]?.[0];
  if (lists.imap) snapshot.imap = one('imap') as Snapshot['imap'];
  if (lists.rcpt) snapshot.rcpt = one('rcpt') as Snapshot['rcpt'];
  if (lists.auth) snapshot.auth = one('auth') as Snapshot['auth'];
  if (lists.security) snapshot.security = one('security') as Snapshot['security'];
  if (lists.http) snapshot.http = one('http') as Snapshot['http'];
  if (lists.oidc) snapshot.oidc = one('oidc') as Snapshot['oidc'];
  if (lists.authentication) snapshot.authentication = one('authentication') as Snapshot['authentication'];
  if (lists.senderAuth) snapshot.senderAuth = one('senderAuth') as Snapshot['senderAuth'];
  if (lists.metrics) snapshot.metrics = one('metrics') as Snapshot['metrics'];
  if (lists.mtaSts) snapshot.mtaSts = one('mtaSts') as Snapshot['mtaSts'];
  if (lists.certificates) {
    snapshot.certificates = lists.certificates.map((c) => {
      const names = c.subjectAlternativeNames;
      return {
        id: String(c.id),
        names: Array.isArray(names) ? names.map(String) : names && typeof names === 'object' ? Object.keys(names) : [],
        notValidAfter: typeof c.notValidAfter === 'string' ? c.notValidAfter : null,
      };
    });
  }
  if (lists.tlsStrategies) {
    snapshot.tlsStrategies = lists.tlsStrategies.map((t) => ({
      id: String(t.id),
      name: String(t.name ?? ''),
      allowInvalidCerts: t.allowInvalidCerts === true,
    }));
  }

  if (critical) {
    snapshot.domains = lists.domains?.map((d) => ({
      id: String(d.id),
      name: String(d.name),
      enabled: d.isEnabled !== false,
      allowRelaying: d.allowRelaying === true,
      missing: null,
      dmarcPolicy: null,
    }));
    return snapshot;
  }

  const [domains, legacy] = await Promise.all([
    lists.domains
      ? Promise.all(
          lists.domains.map(async (d): Promise<DomainSnapshot> => {
            const name = String(d.name);
            const enabled = d.isEnabled !== false;
            const dns = enabled ? await domainDns(name, d.dnsZoneFile as string | undefined).catch(() => null) : null;
            return {
              id: String(d.id),
              name,
              enabled,
              allowRelaying: d.allowRelaying === true,
              missing: dns?.missing ?? null,
              dmarcPolicy: dns?.dmarcPolicy ?? null,
            };
          }),
        )
      : Promise.resolve(undefined),
    fetchProtocolPolicy(signal).catch((e: unknown) => e as Error),
  ]);

  if (domains) {
    snapshot.domains = domains;
    // DNS couldn't be asked about any enabled domain: say so rather than pass them
    const enabled = domains.filter((d) => d.enabled);
    if (enabled.length > 0 && enabled.every((d) => d.missing === null)) {
      snapshot.unavailable.dns = 'Public DNS couldn’t be reached from this browser';
    }
  }
  if (legacy instanceof Error) {
    snapshot.unavailable.legacy = legacy.message || 'The server didn’t say';
  } else {
    snapshot.legacyOn = SWITCHED.some((p) => legacy.switches[p] === 'enabled');
  }
  return snapshot;
}
