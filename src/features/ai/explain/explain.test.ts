/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const jmapRequest = vi.fn();
vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'a',
  jmapRequest: (...args: unknown[]) => jmapRequest(...args),
}));

import {
  DEFAULT_EXPLAIN,
  explainAvailable,
  failedRecipients,
  isRawEvent,
  liveEventSubject,
  requestExplanation,
  saveExplainSettings,
  spamVerdictSubject,
  valueText,
} from './explain';

beforeEach(() => jmapRequest.mockReset());

describe('explainAvailable', () => {
  it('reads the flag from the primary account only', () => {
    const session = {
      accounts: {
        b: { accountCapabilities: { 'urn:inbuxa:jmap': { aiExplain: true } } },
        c: { accountCapabilities: { 'urn:inbuxa:jmap': { aiExplain: false } } },
      },
    };
    expect(explainAvailable(session, 'b')).toBe(true);
    expect(explainAvailable(session, 'c')).toBe(false);
    expect(explainAvailable(session, null)).toBe(false);
    expect(explainAvailable({ accounts: { b: { accountCapabilities: {} } } }, 'b')).toBe(false);
  });
});

describe('subjects', () => {
  it('trims a live event to what the server accepts, without raw contents', () => {
    const keyValues = [
      { key: 'contents', value: { '@type': 'String', value: 'a LOGIN bob hunter2' } },
      { key: 'remoteIp', value: { '@type': 'IpAddr', value: '192.0.2.1' } },
      { key: 'long', value: { '@type': 'String', value: 'x'.repeat(900) } },
      ...Array.from({ length: 60 }, (_, n) => ({ key: `k${n}`, value: { '@type': 'UnsignedInt', value: n } })),
    ];
    const subject = liveEventSubject({ event: 'imap.command', keyValues });
    if (!('keyValues' in subject)) throw new Error('not a live event');
    expect(subject.keyValues).toHaveLength(50);
    expect(JSON.stringify(subject)).not.toContain('hunter2');
    expect(subject.keyValues[0]).toEqual({ key: 'remoteIp', value: '192.0.2.1' });
    expect(subject.keyValues[1].value.length).toBeLessThanOrEqual(500);
  });

  it('flattens typed values the way the server does', () => {
    expect(
      valueText({
        '@type': 'List',
        value: [
          { '@type': 'String', value: 'a' },
          { '@type': 'UnsignedInt', value: 2 },
        ],
      }),
    ).toBe('a, 2');
    expect(isRawEvent('smtp.raw-input')).toBe(true);
    expect(isRawEvent('smtp.ehlo')).toBe(false);
  });

  it('lists only failed recipients, with their reply', () => {
    const failed = failedRecipients({
      'a@example.com': { status: { '@type': 'Scheduled' } },
      'b@example.com': {
        status: {
          '@type': 'PermanentFailure',
          responseCode: 550,
          responseEnhanced: '5.7.26',
          responseMessage: 'DMARC',
        },
      },
      'c@example.com': { status: { '@type': 'TemporaryFailure', errorType: 'ConnectionError' } },
    });
    expect(failed).toEqual([
      { address: 'b@example.com', status: 'PermanentFailure', summary: '550 5.7.26 DMARC' },
      { address: 'c@example.com', status: 'TemporaryFailure', summary: 'ConnectionError' },
    ]);
    expect(failedRecipients(undefined)).toEqual([]);
  });

  it('sends a Classify result back as a verdict', () => {
    expect(
      spamVerdictSubject({
        result: 'spam',
        score: 7.5,
        tags: { DMARC_POLICY_REJECT: { score: 5, disposition: 'score' } },
      }),
    ).toEqual({
      '@type': 'SpamVerdict',
      result: 'spam',
      score: 7.5,
      tags: { DMARC_POLICY_REJECT: { score: 5, disposition: 'score' } },
    });
  });
});

describe('requestExplanation', () => {
  const setting = { '@type': 'Setting', object: 'x:Domain', id: 'b', property: 'isEnabled' } as const;

  it('returns the explanation and its provenance', async () => {
    jmapRequest.mockResolvedValue([
      [
        'inbuxa:Explanation/set',
        { created: { e: { text: 'It turns it on.', model: 'qwen', node: 'host2', elapsedMs: 900 } } },
      ],
    ]);
    const result = await requestExplanation(setting);
    expect(result).toEqual({
      ok: true,
      explanation: { text: 'It turns it on.', model: 'qwen', node: 'host2', elapsedMs: 900 },
    });
    const [calls, , using] = jmapRequest.mock.calls[0];
    expect(calls[0][1]).toEqual({ accountId: 'a', create: { e: { subject: setting } } });
    expect(using).toEqual(['urn:inbuxa:jmap']);
  });

  it.each([
    [{ type: 'serverFail', description: 'busy' }, { kind: 'busy' }],
    [{ type: 'serverFail', description: 'timeout' }, { kind: 'timeout' }],
    [{ type: 'serverFail', description: 'paused' }, { kind: 'paused' }],
    [{ type: 'serverFail', description: 'unavailable' }, { kind: 'unavailable' }],
    [{ type: 'rateLimit' }, { kind: 'rateLimit' }],
    [
      { type: 'forbidden', description: 'That setting holds a secret.' },
      { kind: 'refused', message: 'That setting holds a secret.' },
    ],
  ])('words %o as %o (EX-20)', async (error, failure) => {
    jmapRequest.mockResolvedValue([['inbuxa:Explanation/set', { notCreated: { e: error } }]]);
    expect(await requestExplanation(setting)).toEqual({ ok: false, failure });
  });

  it('treats a server without explanations as unavailable', async () => {
    jmapRequest.mockResolvedValue([['error', { type: 'unknownMethod' }]]);
    expect(await requestExplanation(setting)).toEqual({ ok: false, failure: { kind: 'unavailable' } });
  });
});

describe('saveExplainSettings', () => {
  it('sends only what changed, and a default as null', async () => {
    jmapRequest.mockResolvedValue([['inbuxa:AiLimits/set', { updated: { singleton: null } }]]);
    const outcome = await saveExplainSettings(
      { ...DEFAULT_EXPLAIN, explainCallsPerHour: 10 },
      { ...DEFAULT_EXPLAIN, explainEnabled: false, explainModelId: 'm' },
    );
    expect(outcome).toEqual({ ok: true });
    expect(jmapRequest.mock.calls[0][0][0][1].update.singleton).toEqual({
      explainEnabled: false,
      explainModelId: 'm',
      explainCallsPerHour: null,
    });
  });

  it('does nothing when nothing changed', async () => {
    expect(await saveExplainSettings(DEFAULT_EXPLAIN, { ...DEFAULT_EXPLAIN })).toEqual({ ok: true });
    expect(jmapRequest).not.toHaveBeenCalled();
  });
});
