/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  readSignatureFile,
  attention,
  envelopeLine,
  formatDuration,
  joinCommand,
  linkCaReplacement,
  parseDuration,
  parseDurations,
  parseRange,
  settingsPatch,
  shutOut,
  toForm,
  waiting,
  type Relay,
  type RelayLink,
  type RelayMessage,
  type RelaySettings,
} from './model';

const SETTINGS: RelaySettings = {
  hostname: 'mx1.example.com',
  smtpListen: ['[::]:25'],
  domains: ['example.com'],
  maxMessageSize: 50 * 1024 * 1024,
  maxRecipients: 100,
  rateLimits: { connectionsPerMinute: 60, messagesPerMinute: 60, concurrentSessions: 10 },
  dnsbl: [],
  liveVerdictTimeout: 30,
  heldMaxAge: 30,
  spoolMaxBytes: 2 * 1024 * 1024 * 1024,
  outboundRetry: [120, 300, 600, 1800, 3600, 7200, 14400],
  outboundExpiry: 3 * 86400,
  outboundTls: 'opportunistic',
};

const NOW = new Date('2026-10-30T12:00:00Z');

function link(nodeId: string, extra: Partial<RelayLink> = {}): RelayLink {
  return {
    nodeId,
    state: 'linked',
    since: '2026-10-30T10:00:00Z',
    updatedAt: '2026-10-30T11:59:00Z',
    recipients: 12,
    relay: {
      startedAt: '2026-10-30T09:00:00Z',
      relayVersion: '27.1.0',
      linkClients: 1,
      mode: 'live',
      spool: { inbound: 0, outbound: 2, bytes: 1024 },
      recipientState: 's1',
      selfUpgrade: true,
    },
    ...extra,
  };
}

function relay(extra: Partial<Relay> = {}): Relay {
  return {
    id: 'b',
    name: 'Edge',
    description: '',
    address: '10.0.0.2',
    linkPort: 443,
    enabled: true,
    sendThrough: false,
    inboundOnly: false,
    mxPreference: 10,
    settings: SETTINGS,
    joinState: 'joined',
    links: [link('1')],
    createdBy: 'admin',
    createdAt: '2026-10-30T08:00:00Z',
    updatedAt: '2026-10-30T08:00:00Z',
    ...extra,
  };
}

describe('the link CA', () => {
  it('asks for a new join from a relay on an old one, and nothing else', () => {
    expect(attention(relay({ linkCa: 'old', links: [link('1', { state: 'down' })] }), NOW)).toEqual([
      { kind: 'linkCaOld' },
    ]);
    expect(attention(relay({ linkCa: 'old', joinState: 'waiting', links: [] }), NOW)).toEqual([{ kind: 'linkCaOld' }]);
    expect(attention(relay({ linkCa: 'old', enabled: false }), NOW)).toEqual([]);
  });

  it('names the relays a replacement waits for', () => {
    const since = '2026-10-30T11:00:00Z';
    const relays = [
      relay({ id: 'a', linkCa: 'both', linkCaReplacing: since }),
      relay({ id: 'b', linkCa: 'current', linkCaReplacing: since }),
      relay({ id: 'c', linkCa: null, linkCaReplacing: since }),
      relay({ id: 'd', linkCa: 'current', linkCaReplacing: since, enabled: false }),
      relay({ id: 'e', linkCa: 'old', linkCaReplacing: since, joinState: 'waiting', links: [] }),
    ];
    const found = linkCaReplacement(relays);
    expect(found?.since).toBe(since);
    expect(found?.waiting.map((r) => r.id)).toEqual(['b', 'c']);
    expect(attention(relays[1], NOW)).toEqual([{ kind: 'linkCaWaiting' }]);
    expect(attention(relays[0], NOW)).toEqual([]);
  });

  it('sees none under way, or none on a server before RL-34', () => {
    expect(linkCaReplacement([relay({ linkCa: 'current', linkCaReplacing: null })])).toBeNull();
    expect(linkCaReplacement([relay()])).toBeNull();
    expect(attention(relay({ linkCa: 'current', linkCaReplacing: null }), NOW)).toEqual([]);
  });
});

describe('attention', () => {
  it('says nothing when everything is fine, or the relay is off', () => {
    expect(attention(relay(), NOW)).toEqual([]);
    expect(attention(relay({ enabled: false, links: [] }), NOW)).toEqual([]);
  });

  it('waits for a join, or says it ran out', () => {
    expect(attention(relay({ joinState: 'waiting', joinExpiresAt: 'x', links: [] }), NOW)).toEqual([
      { kind: 'joinWaiting', until: 'x' },
    ]);
    expect(attention(relay({ joinState: 'expired', links: [] }), NOW)).toEqual([{ kind: 'joinExpired' }]);
  });

  it('names each node whose link is down', () => {
    const found = attention(
      relay({
        links: [link('1'), link('2', { state: 'down', lastError: 'refused' }), link('3', { state: 'joinFailed' })],
      }),
      NOW,
    );
    expect(found).toContainEqual({ kind: 'linkDown', nodeId: '2', since: '2026-10-30T10:00:00Z', error: 'refused' });
    expect(found).toContainEqual({ kind: 'joinFailed', nodeId: '3', error: undefined });
    expect(attention(relay({ links: [] }), NOW)).toEqual([{ kind: 'notLinked' }]);
  });

  it('warns of a filling spool, a certificate near its end, and the relay’s own error', () => {
    const status = link('1').relay!;
    const found = attention(
      relay({
        links: [
          link('1', {
            relay: {
              ...status,
              spool: { ...status.spool, bytes: SETTINGS.spoolMaxBytes * 0.9 },
              certificateNotAfter: '2026-11-05T00:00:00Z',
              lastError: 'disk full',
            },
          }),
        ],
      }),
      NOW,
    );
    expect(found).toEqual([
      { kind: 'spoolFilling', percent: 90 },
      { kind: 'certificateExpiring', notAfter: '2026-11-05T00:00:00Z' },
      { kind: 'relayError', error: 'disk full' },
    ]);
    const expired = attention(
      relay({ links: [link('1', { relay: { ...status, certificateNotAfter: '2026-10-01T00:00:00Z' } })] }),
      NOW,
    );
    expect(expired).toEqual([{ kind: 'certificateExpired', notAfter: '2026-10-01T00:00:00Z' }]);
  });

  it('reads the certificate stored here before the one the relay reports', () => {
    const status = link('1').relay!;
    const linked = [link('1', { relay: { ...status, certificateNotAfter: '2027-01-01T00:00:00Z' } })];
    expect(attention(relay({ links: linked, certificateNotAfter: '2026-11-05T00:00:00Z' }), NOW)).toEqual([
      { kind: 'certificateExpiring', notAfter: '2026-11-05T00:00:00Z' },
    ]);
    // None stored, on a server that reads certificates
    expect(attention(relay({ links: [link('1')], certificateNotAfter: null }), NOW)).toEqual([
      { kind: 'noCertificate' },
    ]);
    // An older server sends neither: no line
    expect(attention(relay({ links: [link('1')] }), NOW)).toEqual([]);
    expect(
      attention(relay({ links: [link('1')], certificateNotAfter: null, certificateError: 'rate limited' }), NOW),
    ).toEqual([{ kind: 'certificateFailed', error: 'rate limited' }]);
  });

  it('reads the status the relay sent last', () => {
    const status = link('1').relay!;
    const found = attention(
      relay({
        links: [
          link('1', { updatedAt: '2026-10-30T11:00:00Z', relay: { ...status, lastError: 'old' } }),
          link('2', { updatedAt: '2026-10-30T11:59:00Z' }),
        ],
      }),
      NOW,
    );
    expect(found).toEqual([]);
  });

  it('notices nodes that sent different recipient sets', () => {
    expect(attention(relay({ links: [link('1'), link('2', { recipients: 11 })] }), NOW)).toEqual([
      { kind: 'recipientsDiffer' },
    ]);
  });

  it('says when a relay runs an older release than the server', () => {
    expect(attention(relay({ olderThanServer: false }), NOW)).toEqual([]);
    expect(attention(relay({ olderThanServer: null }), NOW)).toEqual([]);
    expect(attention(relay({ olderThanServer: true }), NOW)).toEqual([
      { kind: 'olderVersion', version: '27.1.0', selfUpgrade: true },
    ]);
    const status = link('1').relay!;
    const image = [link('1', { relay: { ...status, selfUpgrade: false } })];
    expect(attention(relay({ olderThanServer: true, links: image }), NOW)).toEqual([
      { kind: 'olderVersion', version: '27.1.0', selfUpgrade: false },
    ]);
  });
});

describe('signature files', () => {
  const file =
    'inbuxa-relay release 1\nversion 27.1.0-rc.5\ntarget x86_64-linux-musl\nsha256 ' +
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad\nsignature zRj9\n';

  it('reads what a release says it is', () => {
    expect(readSignatureFile(file)).toEqual({ version: '27.1.0-rc.5', target: 'x86_64-linux-musl' });
    expect(readSignatureFile(file.replace(/\n/g, '\r\n'))).toEqual({
      version: '27.1.0-rc.5',
      target: 'x86_64-linux-musl',
    });
  });

  it('refuses anything else', () => {
    expect(readSignatureFile('')).toBeNull();
    expect(readSignatureFile('\x7fELF')).toBeNull();
    expect(readSignatureFile(file.replace('signature zRj9', ''))).toBeNull();
    expect(readSignatureFile(file.replace('version 27.1.0-rc.5', 'version '))).toBeNull();
  });
});

describe('plain forms', () => {
  it('reads and writes durations', () => {
    expect(formatDuration(300)).toBe('5m');
    expect(formatDuration(259200)).toBe('3d');
    expect(formatDuration(90)).toBe('90s');
    expect(formatDuration(0)).toBe('0s');
    expect(parseDuration('5m')).toBe(300);
    expect(parseDuration(' 2H ')).toBe(7200);
    expect(parseDuration('45')).toBe(45);
    expect(parseDuration('5 minutes')).toBeNull();
    expect(parseDurations('2m, 5m,1h')).toEqual([120, 300, 3600]);
    expect(parseDurations('2m, soon')).toBeNull();
  });

  it('sends only what changed', () => {
    const before = toForm(SETTINGS);
    expect(before.outboundRetry).toBe('2m, 5m, 10m, 30m, 1h, 2h, 4h');
    expect(before.maxMessageSizeMb).toBe('50');
    expect(settingsPatch(before, before, SETTINGS)).toEqual({ patch: {} });
    expect(
      settingsPatch(
        before,
        { ...before, maxRecipients: '20', outboundRetry: '1m, 1h', dnsbl: 'zen.example.org\nbl.example.net' },
        SETTINGS,
      ),
    ).toEqual({
      patch: {
        'settings/maxRecipients': 20,
        'settings/outboundRetry': [60, 3600],
        'settings/dnsbl': ['zen.example.org', 'bl.example.net'],
      },
    });
    expect(settingsPatch(before, { ...before, messagesPerMinute: '30' }, SETTINGS)).toEqual({
      patch: {
        'settings/rateLimits': { connectionsPerMinute: 60, messagesPerMinute: 30, concurrentSessions: 10 },
      },
    });
  });

  it('keeps a size it shows rounded until it is changed', () => {
    const odd = { ...SETTINGS, maxMessageSize: 12_345_678 };
    const before = toForm(odd);
    expect(before.maxMessageSizeMb).toBe('11.77');
    expect(settingsPatch(before, { ...before, hostname: 'mx2.example.com' }, odd)).toEqual({
      patch: { 'settings/hostname': 'mx2.example.com' },
    });
    expect(settingsPatch(before, { ...before, maxMessageSizeMb: '25' }, odd)).toEqual({
      patch: { 'settings/maxMessageSize': 25 * 1024 * 1024 },
    });
  });

  it('names the field that doesn’t read', () => {
    const before = toForm(SETTINGS);
    expect(settingsPatch(before, { ...before, maxRecipients: 'many' }, SETTINGS)).toEqual({
      invalid: 'maxRecipients',
    });
    expect(settingsPatch(before, { ...before, outboundRetry: '' }, SETTINGS)).toEqual({ invalid: 'outboundRetry' });
  });
});

describe('queues', () => {
  it('lists who it is from and to, and who still waits', () => {
    const message: RelayMessage = {
      id: 'm',
      relayId: 'b',
      direction: 'outbound',
      relayMessageId: 'o1',
      createdAt: '2026-10-30T11:00:00Z',
      size: 2048,
      envelope: { mailFrom: { email: 'jane@example.com' }, rcptTo: [{ email: 'a@x.test' }, { email: 'b@x.test' }] },
      deliveryStatus: {
        'a@x.test': { smtpReply: '250 2.0.0 Ok', delivered: 'yes' },
        'b@x.test': { smtpReply: '451 4.7.1 Try again later', delivered: 'queued' },
      },
    };
    expect(envelopeLine(message)).toEqual({ from: 'jane@example.com', to: ['a@x.test', 'b@x.test'] });
    expect(waiting(message)).toEqual([{ to: 'b@x.test', reply: '451 4.7.1 Try again later' }]);
    expect(envelopeLine({ ...message, envelope: { mailFrom: { email: '' }, rcptTo: [] } }).from).toBe('<>');
  });

  it('gives the join command', () => {
    expect(joinCommand('abc')).toBe('inbuxa-relay join abc');
  });
});

describe('who may link (RL-33)', () => {
  const from = (address: string) => link('n', { relay: { ...link('n').relay!, linkFrom: address } });

  it('reads addresses and ranges as the relay does', () => {
    for (const ok of [
      '192.0.2.7',
      '192.0.2.0/24',
      '0.0.0.0/0',
      '2001:db8::/32',
      '::1',
      '::ffff:192.0.2.1',
      'fd42:1::2',
    ]) {
      expect(parseRange(ok), ok).not.toBeNull();
    }
    for (const bad of [
      '',
      'relay.example',
      '192.0.2.0/33',
      '2001:db8::/129',
      '192.0.2.0/',
      '192.0.2',
      '1::2::3',
      '192.0.2.0/24/1',
      '256.0.0.1',
    ]) {
      expect(parseRange(bad), bad).toBeNull();
    }
  });

  it('says which addresses this server links from a list leaves out', () => {
    const links = [from('203.0.113.5'), from('2001:db8:5::9'), link('m')];
    expect(shutOut('', links)).toEqual({ known: ['203.0.113.5', '2001:db8:5::9'], outside: [] });
    expect(shutOut('203.0.113.0/24, 2001:db8:5::/48', links).outside).toEqual([]);
    expect(shutOut('203.0.113.0/24', links).outside).toEqual(['2001:db8:5::9']);
    expect(shutOut('198.51.100.1', links).outside).toEqual(['203.0.113.5', '2001:db8:5::9']);
    // An IPv4 node behind a [::] listener is matched as IPv4, both ways
    expect(shutOut('::ffff:203.0.113.5', [from('203.0.113.5')]).outside).toEqual([]);
    expect(shutOut('203.0.113.5', [from('::ffff:203.0.113.5')]).outside).toEqual([]);
    // Nothing to check against, or a list that doesn't read yet
    expect(shutOut('198.51.100.1', [link('m')])).toEqual({ known: [], outside: [] });
    expect(shutOut('198.51.100.1, nope', links).outside).toEqual([]);
  });

  it('sends the list when it changes, and refuses one that does not read', () => {
    const settings = { ...SETTINGS, linkAllowFrom: [] };
    const before = toForm(settings);
    expect(before.linkAllowFrom).toBe('');
    expect(settingsPatch(before, { ...before, linkAllowFrom: '192.0.2.0/24\n2001:db8::/48' }, settings)).toEqual({
      patch: { 'settings/linkAllowFrom': ['192.0.2.0/24', '2001:db8::/48'] },
    });
    expect(settingsPatch(before, { ...before, linkAllowFrom: '192.0.2.0/24, relay.example' }, settings)).toEqual({
      invalid: 'linkAllowFrom',
    });
    // A server before RL-33 has no list, and none is sent
    expect(toForm(SETTINGS).linkAllowFrom).toBe('');
    expect(settingsPatch(toForm(SETTINGS), toForm(SETTINGS), SETTINGS)).toEqual({ patch: {} });
  });
});
