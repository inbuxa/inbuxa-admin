/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Is a record live in public DNS yet? Asked from the browser over DNS-over-HTTPS,
 * so the answer is what the rest of the internet sees, not what the mail
 * server believes it wrote. The resolver sees the names being checked, which
 * are public DNS names anyway; the page says which resolver it uses.
 */
import { normalizeValue, type ZoneRecord } from './zone';

export const RESOLVER_NAME = 'Cloudflare public DNS (1.1.1.1)';
const RESOLVER = 'https://cloudflare-dns.com/dns-query';

/** Resource record type numbers, for reading the JSON answer. */
const TYPE_NUMBERS: Record<string, number> = {
  A: 1,
  CNAME: 5,
  MX: 15,
  TXT: 16,
  AAAA: 28,
  SRV: 33,
  TLSA: 52,
  CAA: 257,
};

export type LiveState = 'live' | 'different' | 'missing' | 'error';

export interface DohRecord {
  name: string;
  type: number;
  data: string;
}

export interface DohResult {
  /** 0 is an answer, 3 is NXDOMAIN (the name doesn't exist). */
  status: number;
  answer: DohRecord[];
  authority: DohRecord[];
}

/** One DNS-over-HTTPS question, answered in the resolver's JSON form. */
export async function dohQuery(name: string, type: string, signal?: AbortSignal): Promise<DohResult> {
  const url = `${RESOLVER}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, { headers: { Accept: 'application/dns-json' }, signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`resolver answered ${res.status}`);
  const body = (await res.json()) as { Status: number; Answer?: DohRecord[]; Authority?: DohRecord[] };
  return { status: body.Status, answer: body.Answer ?? [], authority: body.Authority ?? [] };
}

async function lookup(name: string, type: string, signal?: AbortSignal): Promise<string[]> {
  const { status, answer } = await dohQuery(name, type, signal);
  // NXDOMAIN (3) and "no data" both simply mean: not there yet.
  if (status !== 0 && status !== 3) throw new Error(`resolver status ${status}`);
  const want = TYPE_NUMBERS[type];
  return answer.filter((a) => want === undefined || a.type === want).map((a) => a.data);
}

/**
 * Check a batch of records. Records sharing a name and type are looked up
 * once. A record is `live` when its exact value is published, `different`
 * when that name has other values of the type (another provider's SPF, say),
 * and `missing` when there is nothing.
 */
export async function checkRecords(records: ZoneRecord[], signal?: AbortSignal): Promise<Map<ZoneRecord, LiveState>> {
  const groups = new Map<string, ZoneRecord[]>();
  for (const r of records) {
    const key = `${r.name.toLowerCase()}|${r.type}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const out = new Map<ZoneRecord, LiveState>();
  await Promise.all(
    [...groups.values()].map(async (group) => {
      const { name, type } = group[0];
      try {
        const found = (await lookup(name, type, signal)).map((d) => normalizeValue(type, d));
        for (const r of group) {
          const want = normalizeValue(type, r.value);
          out.set(r, found.includes(want) ? 'live' : found.length > 0 ? 'different' : 'missing');
        }
      } catch {
        for (const r of group) out.set(r, 'error');
      }
    }),
  );
  return out;
}
