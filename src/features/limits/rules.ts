/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: sending and receiving limits as sentences, and presets for them
 * (settings-reorg, second wave). A stock server has no limits at all.
 *
 * How the server applies them (common/src/config/smtp/queue.rs):
 * - an inbound rule is checked when a server connects, at MAIL FROM, or at
 *   RCPT TO, depending on its keys (remote IP → connection; sender or
 *   signed-in account → each message; recipient → each recipient);
 * - an outbound rule is checked per delivery attempt, keyed by the
 *   receiving server, sender or recipient domain; going over defers;
 * - a queue quota caps what one sender or recipient may have waiting.
 */

export type LimitObject = 'x:MtaInboundThrottle' | 'x:MtaOutboundThrottle' | 'x:MtaQueueQuota';

export type Expr = { match: Record<string, { if: string; then: string }>; else: string };

export interface RuleRecord {
  id?: string;
  description?: string | null;
  enable?: boolean;
  key?: Record<string, boolean>;
  match?: Partial<Expr> | null;
  rate?: { count: number; period: number } | null;
  messages?: number | null;
  size?: number | null;
}

const KEY_WORDS: Record<string, string> = {
  remoteIp: 'sending IP address',
  localIp: 'local IP address',
  listener: 'listener',
  authenticatedAs: 'signed-in account',
  heloDomain: 'greeting name',
  sender: 'sender address',
  senderDomain: 'sender domain',
  rcpt: 'recipient',
  rcptDomain: 'recipient domain',
  mx: 'receiving mail server',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function periodWords(ms: number): string {
  if (ms === MINUTE) return 'a minute';
  if (ms === HOUR) return 'an hour';
  if (ms === DAY) return 'a day';
  if (ms === 1000) return 'a second';
  if (ms % DAY === 0) return `every ${ms / DAY} days`;
  if (ms % HOUR === 0) return `every ${ms / HOUR} hours`;
  if (ms % MINUTE === 0) return `every ${ms / MINUTE} minutes`;
  return `every ${Math.round(ms / 1000)} seconds`;
}

export function sizeWords(bytes: number): string {
  if (bytes >= 1024 ** 3 && bytes % 1024 ** 3 === 0) return `${bytes / 1024 ** 3} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function keysOf(r: RuleRecord): string[] {
  return Object.entries(r.key ?? {})
    .filter(([, on]) => on)
    .map(([k]) => k);
}

function perWhat(keys: string[]): string {
  if (keys.length === 0) return 'The whole server';
  return `Each ${keys.map((k) => KEY_WORDS[k] ?? k).join(' and ')}`;
}

/** A condition that reads the recipient makes the server check the rule once per recipient. */
function mentionsRcpt(r: RuleRecord): boolean {
  const m = r.match;
  const text = [m?.else ?? '', ...Object.values(m?.match ?? {}).map((x) => `${x.if} ${x.then}`)].join(' ');
  return /\brcpt(_domain)?\b/.test(text);
}

function conditional(r: RuleRecord): boolean {
  const m = r.match;
  if (!m) return false;
  const rules = Object.values(m.match ?? {});
  const otherwise = (m.else ?? '').trim();
  // No condition, an empty one or plain "true" all mean the rule always applies.
  return rules.length > 0 || (otherwise !== '' && otherwise !== 'true');
}

/**
 * A rule as a sentence: "Each sending IP address: 20 connections a minute."
 * A rule the presets wrote reads as the guide worded it.
 */
export function describe(object: LimitObject, r: RuleRecord): string {
  const preset = PRESET_RULES.find((p) => p.object === object && r.description === `${PRESET_MARK}${p.name}`);
  const n = preset ? (preset.unit === 'messages' ? r.messages : r.rate?.count) : null;
  if (preset && n) return preset.sentence(n) + (r.enable === false ? ' (off)' : '');
  return describeRule(object, r);
}

function describeRule(object: LimitObject, r: RuleRecord): string {
  const keys = keysOf(r);
  const who = perWhat(keys);
  const when = conditional(r) ? ', when its condition matches' : '';
  const off = r.enable === false ? ' (off)' : '';
  if (object === 'x:MtaQueueQuota') {
    const caps = [r.messages ? `${r.messages} messages` : null, r.size ? sizeWords(r.size) : null].filter(Boolean);
    return `${who}: at most ${caps.join(' or ') || 'no limit'} waiting in the queue${when}.${off}`;
  }
  const count = r.rate?.count ?? 0;
  const period = periodWords(r.rate?.period ?? MINUTE);
  let what: string;
  if (object === 'x:MtaOutboundThrottle') what = 'deliveries';
  else if (keys.some((k) => k === 'rcpt' || k === 'rcptDomain') || mentionsRcpt(r)) what = 'recipients';
  else if (keys.some((k) => k === 'sender' || k === 'senderDomain' || k === 'authenticatedAs' || k === 'heloDomain'))
    what = 'messages';
  else what = 'connections';
  return `${who}: ${count} ${what} ${period}${when}.${off}`;
}

// ── Presets ──

export type Profile = 'personal' | 'organization' | 'hosting';
export const PROFILES: Profile[] = ['personal', 'organization', 'hosting'];

/** Preset rules carry this at the start of their description, so running the guide again finds them. */
export const PRESET_MARK = 'Preset: ';

export interface PresetRule {
  id: string;
  object: LimitObject;
  /** The description written to the rule, after the mark. */
  name: string;
  /** Which number the person can adjust, and its unit. */
  unit: 'count' | 'messages';
  values: Record<Profile, number>;
  /** Everything but the number. */
  build: (n: number) => RuleRecord;
  sentence: (n: number) => string;
}

const onPort25: Partial<Expr> = { match: { '0': { if: 'local_port == 25', then: 'true' } }, else: 'false' };
const signedIn: Partial<Expr> = { match: {}, else: '!is_empty(authenticated_as)' };
const signedInRcpt: Partial<Expr> = { match: {}, else: '!is_empty(authenticated_as) && !is_empty(rcpt)' };

export const PRESET_RULES: PresetRule[] = [
  {
    id: 'connections',
    object: 'x:MtaInboundThrottle',
    name: 'connections per sending server',
    unit: 'count',
    values: { personal: 20, organization: 60, hosting: 300 },
    build: (n) => ({ key: { remoteIp: true }, match: onPort25, rate: { count: n, period: MINUTE } }),
    sentence: (n) => `Each outside server may connect ${n} times a minute on port 25.`,
  },
  {
    id: 'sending',
    object: 'x:MtaInboundThrottle',
    name: 'messages per signed-in account',
    unit: 'count',
    values: { personal: 100, organization: 500, hosting: 100 },
    build: (n) => ({ key: { authenticatedAs: true }, match: signedIn, rate: { count: n, period: HOUR } }),
    sentence: (n) => `Each signed-in person may send ${n} messages an hour. Caps the damage from a stolen password.`,
  },
  {
    id: 'recipients',
    object: 'x:MtaInboundThrottle',
    name: 'recipients per signed-in account',
    unit: 'count',
    values: { personal: 500, organization: 2000, hosting: 500 },
    // Keyed by the account alone, so every recipient counts toward one total; the
    // condition names rcpt, which is what makes the server check it at RCPT TO.
    build: (n) => ({ key: { authenticatedAs: true }, match: signedInRcpt, rate: { count: n, period: HOUR } }),
    sentence: (n) => `Each signed-in person may address ${n} recipients an hour, across all their messages.`,
  },
  {
    id: 'per-mx',
    object: 'x:MtaOutboundThrottle',
    name: 'deliveries per receiving server',
    unit: 'count',
    values: { personal: 30, organization: 60, hosting: 120 },
    build: (n) => ({ key: { mx: true }, rate: { count: n, period: MINUTE } }),
    sentence: (n) =>
      `At most ${n} deliveries a minute to any one receiving server, so big providers don’t see a burst and slow you down.`,
  },
  {
    id: 'queue',
    object: 'x:MtaQueueQuota',
    name: 'waiting messages per sender',
    unit: 'messages',
    values: { personal: 500, organization: 2000, hosting: 500 },
    build: (n) => ({ key: { sender: true }, messages: n, size: n * 512 * 1024 }),
    sentence: (n) =>
      `Each sender may have at most ${n} messages (about ${sizeWords(n * 512 * 1024)}) waiting to be delivered.`,
  },
];

/** The record a preset rule writes. */
export function presetRecord(rule: PresetRule, n: number): RuleRecord {
  return { description: `${PRESET_MARK}${rule.name}`, enable: true, ...rule.build(n) };
}

/** Which saved rule, if any, a preset rule wrote before. */
export function findPreset(rule: PresetRule, saved: Record<LimitObject, RuleRecord[]>): RuleRecord | undefined {
  return saved[rule.object].find((r) => r.description === `${PRESET_MARK}${rule.name}`);
}

/** The number a saved preset rule holds now. */
export function currentValue(rule: PresetRule, saved: RuleRecord): number | null {
  if (rule.unit === 'messages') return saved.messages ?? null;
  return saved.rate?.count ?? null;
}
