/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe as group, it, expect } from 'vitest';
import { describe, findPreset, periodWords, PRESET_RULES, presetRecord, sizeWords } from './rules';

group('describe', () => {
  it('says an inbound rule per remote IP counts connections', () => {
    expect(describe('x:MtaInboundThrottle', { key: { remoteIp: true }, rate: { count: 20, period: 60_000 } })).toBe(
      'Each sending IP address: 20 connections a minute.',
    );
  });

  it('says a rule keyed by account counts messages, or recipients when its condition reads rcpt', () => {
    expect(
      describe('x:MtaInboundThrottle', { key: { authenticatedAs: true }, rate: { count: 100, period: 3_600_000 } }),
    ).toBe('Each signed-in account: 100 messages an hour.');
    expect(
      describe('x:MtaInboundThrottle', {
        key: { authenticatedAs: true },
        match: { match: {}, else: '!is_empty(authenticated_as) && !is_empty(rcpt)' },
        rate: { count: 500, period: 3_600_000 },
      }),
    ).toBe('Each signed-in account: 500 recipients an hour, when its condition matches.');
  });

  it('describes deliveries, quotas, the whole server and rules that are off', () => {
    expect(describe('x:MtaOutboundThrottle', { key: { mx: true }, rate: { count: 30, period: 60_000 } })).toBe(
      'Each receiving mail server: 30 deliveries a minute.',
    );
    expect(describe('x:MtaQueueQuota', { key: { sender: true }, messages: 500, size: 262_144_000 })).toBe(
      'Each sender address: at most 500 messages or 250 MB waiting in the queue.',
    );
    expect(describe('x:MtaOutboundThrottle', { rate: { count: 5, period: 1000 }, enable: false })).toBe(
      'The whole server: 5 deliveries a second. (off)',
    );
  });
});

group('words', () => {
  it('names periods and sizes', () => {
    expect(periodWords(3_600_000)).toBe('an hour');
    expect(periodWords(300_000)).toBe('every 5 minutes');
    expect(sizeWords(1024 ** 3)).toBe('1 GB');
  });
});

group('presets', () => {
  it('mark what they write, so the guide finds them again', () => {
    const rule = PRESET_RULES[0];
    const record = presetRecord(rule, 20);
    expect(record.description).toBe('Preset: connections per sending server');
    const saved = {
      'x:MtaInboundThrottle': [{ ...record, id: 'a' }],
      'x:MtaOutboundThrottle': [],
      'x:MtaQueueQuota': [],
    };
    expect(findPreset(rule, saved)?.id).toBe('a');
    expect(findPreset(PRESET_RULES[1], saved)).toBeUndefined();
  });

  it('read the same in the list as in the guide', () => {
    for (const rule of PRESET_RULES) {
      expect(describe(rule.object, presetRecord(rule, 10))).toBe(rule.sentence(10));
    }
  });

  it('treat an empty condition as always', () => {
    expect(
      describe('x:MtaQueueQuota', { key: { rcptDomain: true }, match: { match: {}, else: '' }, messages: 10 }),
    ).toBe('Each recipient domain: at most 10 messages waiting in the queue.');
  });
});
