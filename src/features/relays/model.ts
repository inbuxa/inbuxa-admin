/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: inbuxa Relays as the Relays page sees them (relay spec,
 * "inbuxa-admin"): the `inbuxa:Relay` and `inbuxa:RelayMessage` shapes the
 * server sends, what needs attention on a relay, and the plain forms the
 * page edits its settings in.
 */

export type LinkCa = 'current' | 'both' | 'old';

export type LinkState = 'connecting' | 'joining' | 'linked' | 'down' | 'joinFailed';

/** What a relay last said of itself, over one node's link. */
export interface RelayStatus {
  startedAt: string;
  relayVersion: string;
  linkClients: number;
  mode: 'unconfigured' | 'live' | 'held';
  spool: { inbound: number; outbound: number; bytes: number };
  recipientState: string;
  certificateNotAfter?: string | null;
  lastError?: string | null;
  selfUpgrade: boolean;
  /** Absent from relays before RL-33: where the relay sees this node's link from. */
  linkFrom?: string | null;
}

/** One node's link to a relay. */
export interface RelayLink {
  nodeId: string;
  state: LinkState;
  since: string;
  lastSeen?: string | null;
  lastError?: string | null;
  relay?: RelayStatus | null;
  recipients?: number | null;
  updatedAt: string;
}

export interface RelaySettings {
  hostname: string;
  smtpListen: string[];
  domains: string[];
  maxMessageSize: number;
  maxRecipients: number;
  rateLimits: { connectionsPerMinute: number; messagesPerMinute: number; concurrentSessions: number };
  dnsbl: string[];
  liveVerdictTimeout: number;
  heldMaxAge: number;
  spoolMaxBytes: number;
  outboundRetry: number[];
  outboundExpiry: number;
  outboundTls: 'opportunistic' | 'required';
  /** Absent from servers before RL-33: who may dial the link; empty is anyone. */
  linkAllowFrom?: string[];
}

export interface Relay {
  id: string;
  name: string;
  description: string;
  address: string;
  linkPort: number;
  enabled: boolean;
  sendThrough: boolean;
  inboundOnly: boolean;
  /** Absent from servers before RL-25. */
  mxPreference?: number;
  settings: RelaySettings;
  /** Its STARTTLS certificate chain, PEM; the key reads back as `****`. */
  smtpCertificate?: string | null;
  smtpPrivateKey?: string | null;
  /** Absent from servers before RL-27: when the stored certificate runs out. */
  certificateNotAfter?: string | null;
  /** Why this server's last order for its certificate failed (RL-27). */
  certificateError?: string | null;
  /** Absent from servers before RL-28: a link last heard an older release than the server's. */
  olderThanServer?: boolean | null;
  /**
   * Absent from servers before RL-34: the link CA it trusts, `both` during a
   * replacement, `old` when it only trusts one since replaced; null before
   * it has said.
   */
  linkCa?: LinkCa | null;
  /** Absent from servers before RL-34: when the replacement of the link CA under way began. */
  linkCaReplacing?: string | null;
  /** Absent from servers before RL-35: the relay keys are wrapped under INBUXA_RELAY_KEY_FILE's file. */
  keysWrapped?: boolean;
  joinState: 'waiting' | 'expired' | 'joined';
  joinExpiresAt?: string | null;
  joinedAt?: string | null;
  links: RelayLink[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EnvelopeAddress {
  email: string;
  parameters?: Record<string, string | null> | null;
}

export interface DeliveryStatus {
  smtpReply: string;
  delivered: 'queued' | 'yes' | 'no' | 'unknown';
  mx?: string | null;
}

/** A message waiting at a relay (`inbuxa:RelayMessage`). Never its content. */
export interface RelayMessage {
  id: string;
  relayId: string;
  direction: 'inbound' | 'outbound';
  relayMessageId: string;
  createdAt: string;
  size: number;
  envelope: { mailFrom: EnvelopeAddress; rcptTo: EnvelopeAddress[] };
  state?: 'pending' | 'held' | 'claimed' | null;
  claimedUntil?: string | null;
  session?: { remoteIp?: string; helo?: string } | null;
  deliveryStatus?: Record<string, DeliveryStatus> | null;
  nextAttemptAt?: string | null;
  attempts?: number | null;
  expiresAt?: string | null;
  queueId?: string | null;
}

// --- Attention ----------------------------------------------------------------

/**
 * Something about a relay an administrator should look at. The list shows
 * these and nothing else: no line at all when everything is fine.
 */
export type Attention =
  | { kind: 'joinWaiting'; until?: string | null }
  | { kind: 'joinExpired' }
  | { kind: 'notLinked' }
  | { kind: 'linkDown'; nodeId: string; since: string; error?: string | null }
  | { kind: 'joinFailed'; nodeId: string; error?: string | null }
  | { kind: 'spoolFilling'; percent: number }
  | { kind: 'certificateExpiring'; notAfter: string }
  | { kind: 'certificateExpired'; notAfter: string }
  | { kind: 'noCertificate' }
  | { kind: 'certificateFailed'; error: string }
  | { kind: 'relayError'; error: string }
  | { kind: 'olderVersion'; version: string | null; selfUpgrade: boolean }
  | { kind: 'recipientsDiffer' }
  | { kind: 'linkCaOld' }
  | { kind: 'linkCaWaiting' };

/** A spool this full is worth a line. */
export const SPOOL_WARN = 0.8;
/** A certificate this close to expiring is worth a line. */
export const CERTIFICATE_WARN_DAYS = 14;

/** What the relay said last, over whichever link heard from it most recently. */
export function latestStatus(relay: Relay): RelayStatus | null {
  let best: RelayLink | null = null;
  for (const link of relay.links) {
    if (link.relay && (!best || link.updatedAt > best.updatedAt)) best = link;
  }
  return best?.relay ?? null;
}

export function attention(relay: Relay, now: Date = new Date()): Attention[] {
  if (!relay.enabled) return [];
  // It can't link until it joins again, so nothing else it says matters
  if (relay.linkCa === 'old') return [{ kind: 'linkCaOld' }];
  if (relay.joinState === 'waiting') return [{ kind: 'joinWaiting', until: relay.joinExpiresAt }];
  if (relay.joinState === 'expired') return [{ kind: 'joinExpired' }];
  const out: Attention[] = [];
  if (relay.links.length === 0) out.push({ kind: 'notLinked' });
  for (const link of relay.links) {
    if (link.state === 'joinFailed') out.push({ kind: 'joinFailed', nodeId: link.nodeId, error: link.lastError });
    else if (link.state !== 'linked')
      out.push({ kind: 'linkDown', nodeId: link.nodeId, since: link.since, error: link.lastError });
  }
  const status = latestStatus(relay);
  if (status) {
    const max = relay.settings.spoolMaxBytes;
    if (max > 0 && status.spool.bytes / max >= SPOOL_WARN) {
      out.push({ kind: 'spoolFilling', percent: Math.min(100, Math.round((status.spool.bytes / max) * 100)) });
    }
  }
  // The certificate stored here, or else the one the relay reports
  const notAfter = relay.certificateNotAfter ?? status?.certificateNotAfter;
  if (notAfter) {
    const left = new Date(notAfter).getTime() - now.getTime();
    if (left <= 0) out.push({ kind: 'certificateExpired', notAfter });
    else if (left < CERTIFICATE_WARN_DAYS * 86_400_000) out.push({ kind: 'certificateExpiring', notAfter });
  } else if (relay.certificateNotAfter === null && !relay.certificateError) {
    // A server that reads certificates says there's none
    out.push({ kind: 'noCertificate' });
  }
  if (relay.certificateError) out.push({ kind: 'certificateFailed', error: relay.certificateError });
  if (status?.lastError) out.push({ kind: 'relayError', error: status.lastError });
  if (relay.olderThanServer) {
    out.push({ kind: 'olderVersion', version: status?.relayVersion ?? null, selfUpgrade: status?.selfUpgrade ?? true });
  }
  // Every node sends the same recipients; nodes that disagree have a stale set
  const counts = new Set(
    relay.links.filter((l) => l.state === 'linked' && l.recipients != null).map((l) => l.recipients),
  );
  if (counts.size > 1) out.push({ kind: 'recipientsDiffer' });
  if (holdsUpReplacement(relay)) out.push({ kind: 'linkCaWaiting' });
  return out;
}

/** The server finishes a replacement once every enabled, joined relay trusts both CAs. */
function holdsUpReplacement(relay: Relay): boolean {
  return !!relay.linkCaReplacing && relay.enabled && relay.joinState === 'joined' && relay.linkCa !== 'both';
}

/** A replacement of the link CA under way (RL-34): when it began, and the relays it waits for. */
export function linkCaReplacement(relays: Relay[]): { since: string; waiting: Relay[] } | null {
  const since = relays.find((r) => r.linkCaReplacing)?.linkCaReplacing;
  return since ? { since, waiting: relays.filter(holdsUpReplacement) } : null;
}

/** What a relay release's signature file says it is (RL-29). */
export interface ReleaseInfo {
  version: string;
  target: string;
}

/**
 * Reads a signature file, `inbuxa-relay-<target>.sig`, for the upgrade
 * dialog to show; null if it isn't one. The server and the relay check the
 * signature: this only reads it.
 */
export function readSignatureFile(text: string): ReleaseInfo | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== 'inbuxa-relay release 1') return null;
  const field = (line: string | undefined, name: string) =>
    line?.startsWith(`${name} `) ? line.slice(name.length + 1).trim() || null : null;
  const version = field(lines[1], 'version');
  const target = field(lines[2], 'target');
  if (!version || !target || !field(lines[3], 'sha256') || !field(lines[4], 'signature')) return null;
  return { version, target };
}

/** The one command to run on the relay host, with the join token. */
export function joinCommand(token: string): string {
  return `inbuxa-relay join ${token}`;
}

// --- Plain forms --------------------------------------------------------------

const UNITS: [string, number][] = [
  ['d', 86_400],
  ['h', 3_600],
  ['m', 60],
  ['s', 1],
];

/** Seconds as the largest unit that divides them exactly: 300 → "5m". */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s';
  for (const [unit, size] of UNITS) {
    if (seconds % size === 0) return `${seconds / size}${unit}`;
  }
  return `${seconds}s`;
}

/** "5m", "2h", "3d", "90s" or a bare number of seconds; null if it isn't one. */
export function parseDuration(text: string): number | null {
  const match = /^\s*(\d+)\s*([dhms]?)\s*$/i.exec(text);
  if (!match) return null;
  const size = UNITS.find(([unit]) => unit === (match[2] || 's').toLowerCase())?.[1] ?? 1;
  return Number(match[1]) * size;
}

/** A list in a text box: one item per comma or line, blanks dropped. */
export function parseList(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A comma list of durations, or null if one isn't. */
export function parseDurations(text: string): number[] | null {
  const out: number[] = [];
  for (const item of parseList(text)) {
    const seconds = parseDuration(item);
    if (seconds === null) return null;
    out.push(seconds);
  }
  return out;
}

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** The settings as the form shows them, every value as text. */
export interface SettingsForm {
  hostname: string;
  smtpListen: string;
  maxMessageSizeMb: string;
  maxRecipients: string;
  connectionsPerMinute: string;
  messagesPerMinute: string;
  concurrentSessions: string;
  dnsbl: string;
  liveVerdictTimeout: string;
  heldMaxAge: string;
  spoolMaxGb: string;
  outboundRetry: string;
  outboundExpiry: string;
  outboundTls: 'opportunistic' | 'required';
  linkAllowFrom: string;
}

function trimmedNumber(value: number): string {
  return String(Number(value.toFixed(2)));
}

export function toForm(s: RelaySettings): SettingsForm {
  return {
    hostname: s.hostname,
    smtpListen: s.smtpListen.join(', '),
    maxMessageSizeMb: trimmedNumber(s.maxMessageSize / MB),
    maxRecipients: String(s.maxRecipients),
    connectionsPerMinute: String(s.rateLimits.connectionsPerMinute),
    messagesPerMinute: String(s.rateLimits.messagesPerMinute),
    concurrentSessions: String(s.rateLimits.concurrentSessions),
    dnsbl: s.dnsbl.join(', '),
    liveVerdictTimeout: formatDuration(s.liveVerdictTimeout),
    heldMaxAge: String(s.heldMaxAge),
    spoolMaxGb: trimmedNumber(s.spoolMaxBytes / GB),
    outboundRetry: s.outboundRetry.map(formatDuration).join(', '),
    outboundExpiry: formatDuration(s.outboundExpiry),
    outboundTls: s.outboundTls,
    linkAllowFrom: (s.linkAllowFrom ?? []).join(', '),
  };
}

function whole(text: string): number | null {
  return /^\s*\d+\s*$/.test(text) ? Number(text) : null;
}

function amount(text: string, unit: number): number | null {
  return /^\s*\d+(\.\d+)?\s*$/.test(text) ? Math.round(Number(text) * unit) : null;
}

/**
 * What changed between the form as it was loaded and as it is now, as the
 * server takes it (`settings/<name>`), or the first field that doesn't
 * read. A field left as it was is never sent, so a value the form rounds
 * (a size in MB) stays exactly as the server had it.
 */
export function settingsPatch(
  before: SettingsForm,
  after: SettingsForm,
  current: RelaySettings,
): { patch: Record<string, unknown> } | { invalid: keyof SettingsForm } {
  const patch: Record<string, unknown> = {};
  const changed = (field: keyof SettingsForm) => before[field] !== after[field];
  const read = <T>(field: keyof SettingsForm, value: T | null): T | undefined => {
    if (value === null) throw field;
    return value;
  };
  try {
    if (changed('hostname')) patch['settings/hostname'] = after.hostname.trim();
    if (changed('smtpListen')) patch['settings/smtpListen'] = parseList(after.smtpListen);
    if (changed('maxMessageSizeMb'))
      patch['settings/maxMessageSize'] = read('maxMessageSizeMb', amount(after.maxMessageSizeMb, MB));
    if (changed('maxRecipients')) patch['settings/maxRecipients'] = read('maxRecipients', whole(after.maxRecipients));
    if (changed('connectionsPerMinute') || changed('messagesPerMinute') || changed('concurrentSessions')) {
      patch['settings/rateLimits'] = {
        ...current.rateLimits,
        connectionsPerMinute: read('connectionsPerMinute', whole(after.connectionsPerMinute)),
        messagesPerMinute: read('messagesPerMinute', whole(after.messagesPerMinute)),
        concurrentSessions: read('concurrentSessions', whole(after.concurrentSessions)),
      };
    }
    if (changed('dnsbl')) patch['settings/dnsbl'] = parseList(after.dnsbl);
    if (changed('liveVerdictTimeout'))
      patch['settings/liveVerdictTimeout'] = read('liveVerdictTimeout', parseDuration(after.liveVerdictTimeout));
    if (changed('heldMaxAge')) patch['settings/heldMaxAge'] = read('heldMaxAge', whole(after.heldMaxAge));
    if (changed('spoolMaxGb')) patch['settings/spoolMaxBytes'] = read('spoolMaxGb', amount(after.spoolMaxGb, GB));
    if (changed('outboundRetry')) {
      const retry = read('outboundRetry', parseDurations(after.outboundRetry));
      if (!retry?.length) throw 'outboundRetry';
      patch['settings/outboundRetry'] = retry;
    }
    if (changed('outboundExpiry'))
      patch['settings/outboundExpiry'] = read('outboundExpiry', parseDuration(after.outboundExpiry));
    if (changed('outboundTls')) patch['settings/outboundTls'] = after.outboundTls;
    if (changed('linkAllowFrom')) {
      const list = parseList(after.linkAllowFrom);
      if (list.length > MAX_ALLOW || !list.every((entry) => parseRange(entry))) throw 'linkAllowFrom';
      patch['settings/linkAllowFrom'] = list;
    }
  } catch (field) {
    return { invalid: field as keyof SettingsForm };
  }
  return { patch };
}

/** Who sent it and to whom, for a line in the queue. */
export function envelopeLine(message: RelayMessage): { from: string; to: string[] } {
  return {
    from: message.envelope?.mailFrom?.email || '<>',
    to: (message.envelope?.rcptTo ?? []).map((r) => r.email),
  };
}

/** The outbound recipients still waiting, with the last reply each got. */
export function waiting(message: RelayMessage): { to: string; reply: string }[] {
  return Object.entries(message.deliveryStatus ?? {})
    .filter(([, status]) => status.delivered === 'queued')
    .map(([to, status]) => ({ to, reply: status.smtpReply }));
}

// ---- who may dial the link (RL-33) ----

/** The most entries the relay takes in `linkAllowFrom`. */
export const MAX_ALLOW = 64;

interface Range {
  v6: boolean;
  addr: bigint;
  bits: number;
}

function parseIPv4(text: string): bigint | null {
  const parts = text.split('.');
  if (parts.length !== 4) return null;
  let out = 0n;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return null;
    out = (out << 8n) | BigInt(Number(part));
  }
  return out;
}

function parseIPv6(text: string): bigint | null {
  let groups: string[];
  // A trailing IPv4 part, as in ::ffff:192.0.2.1
  const v4 = /^(.*:)(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  let tail: bigint | null = null;
  if (v4) {
    tail = parseIPv4(v4[2]);
    if (tail === null) return null;
    text = v4[1] + '0:0';
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const split = (h: string) => (h === '' ? [] : h.split(':'));
  if (halves.length === 2) {
    const head = split(halves[0]);
    const rest = split(halves[1]);
    if (head.length + rest.length > 7) return null;
    groups = [...head, ...Array(8 - head.length - rest.length).fill('0'), ...rest];
  } else {
    groups = split(text);
  }
  if (groups.length !== 8) return null;
  let out = 0n;
  for (const group of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    out = (out << 16n) | BigInt(parseInt(group, 16));
  }
  if (tail !== null) out = (out & ~0xffffffffn) | tail;
  return out;
}

const MAPPED = 0xffff00000000n;

/** An address, IPv4-mapped IPv6 taken as the IPv4 it carries, as the relay takes it. */
function parseAddress(text: string): { v6: boolean; addr: bigint } | null {
  const v4 = parseIPv4(text);
  if (v4 !== null) return { v6: false, addr: v4 };
  const v6 = parseIPv6(text);
  if (v6 === null) return null;
  if (v6 >> 32n === MAPPED >> 32n) return { v6: false, addr: v6 & 0xffffffffn };
  return { v6: true, addr: v6 };
}

function masked(addr: bigint, bits: number, width: number): bigint {
  const shift = BigInt(width - bits);
  return (addr >> shift) << shift;
}

/** `192.0.2.7`, `192.0.2.0/24` or `2001:db8::/48`, as the relay reads them. */
export function parseRange(text: string): Range | null {
  const [addrText, bitsText, extra] = text.trim().split('/');
  if (extra !== undefined) return null;
  const parsed = parseAddress(addrText);
  if (!parsed) return null;
  const width = parsed.v6 ? 128 : 32;
  let bits = width;
  if (bitsText !== undefined) {
    if (!/^\d+$/.test(bitsText) || Number(bitsText) > width) return null;
    bits = Number(bitsText);
  }
  return { v6: parsed.v6, addr: masked(parsed.addr, bits, width), bits };
}

function allows(ranges: Range[], address: string): boolean {
  const parsed = parseAddress(address);
  if (!parsed) return false;
  return ranges.some((r) => r.v6 === parsed.v6 && masked(parsed.addr, r.bits, r.v6 ? 128 : 32) === r.addr);
}

/**
 * The addresses the relay last saw this server's nodes link from that a
 * `linkAllowFrom` list would turn away, and whether any were seen at all:
 * a list that leaves them all out locks this server out (RL-33).
 */
export function shutOut(list: string, links: RelayLink[]): { known: string[]; outside: string[] } {
  const known = [...new Set(links.map((l) => l.relay?.linkFrom).filter((a): a is string => !!a))];
  const entries = parseList(list);
  const ranges = entries.map(parseRange);
  if (entries.length === 0 || ranges.some((r) => !r)) return { known, outside: [] };
  return { known, outside: known.filter((a) => !allows(ranges as Range[], a)) };
}
