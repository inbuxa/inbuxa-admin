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
  | { kind: 'relayError'; error: string }
  | { kind: 'recipientsDiffer' };

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
    if (status.certificateNotAfter) {
      const left = new Date(status.certificateNotAfter).getTime() - now.getTime();
      if (left <= 0) out.push({ kind: 'certificateExpired', notAfter: status.certificateNotAfter });
      else if (left < CERTIFICATE_WARN_DAYS * 86_400_000)
        out.push({ kind: 'certificateExpiring', notAfter: status.certificateNotAfter });
    }
    if (status.lastError) out.push({ kind: 'relayError', error: status.lastError });
  }
  // Every node sends the same recipients; nodes that disagree have a stale set
  const counts = new Set(
    relay.links.filter((l) => l.state === 'linked' && l.recipients != null).map((l) => l.recipients),
  );
  if (counts.size > 1) out.push({ kind: 'recipientsDiffer' });
  return out;
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
