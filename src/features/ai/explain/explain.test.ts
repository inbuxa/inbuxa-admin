/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const jmapRequest = vi.fn();
vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'a',
  jmapRequest: (...args: unknown[]) => jmapRequest(...args),
}));
const apiFetch = vi.fn();
vi.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

import {
  DEFAULT_EXPLAIN,
  parseEvent,
  streamExplanation,
  explainAvailable,
  failedRecipients,
  isRawEvent,
  liveEventSubject,
  requestExplanation,
  saveExplainSettings,
  spamVerdictSubject,
  valueText,
} from './explain';
import { normalizeTraceEvents } from '@/features/tracing/normalize';

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

  it('takes a live event as the stream sends it, key-values as a JMAP map', () => {
    const [event] = normalizeTraceEvents(
      JSON.parse(
        '[{"event":"http.response-body","timestamp":"2026-09-26T08:07:09Z","keyValues":{' +
          '"0":{"key":"spanId","value":{"value":331622707493871616,"@type":"UnsignedInt"}},' +
          '"1":{"key":"contents","value":{"value":"{\\"accessToken\\":\\"secret\\"}","@type":"String"}},' +
          '"2":{"key":"code","value":{"value":200,"@type":"UnsignedInt"}}}}]',
      ),
    );
    const subject = liveEventSubject(event);
    if (!('keyValues' in subject)) throw new Error('not a live event');
    expect(subject.keyValues.map((kv) => kv.key)).toEqual(['spanId', 'code']);
    expect(subject.keyValues[1]).toEqual({ key: 'code', value: '200' });
    expect(JSON.stringify(subject)).not.toContain('secret');
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
      explanation: { text: 'It turns it on.', model: 'qwen', node: 'host2', elapsedMs: 900, source: 'model' },
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

describe('streamExplanation (EX-23)', () => {
  const setting = { '@type': 'Setting', object: 'x:Domain', id: 'b', property: 'isEnabled' } as const;

  function streamed(chunks: string[], status = 200): Response {
    const encoder = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { status, headers: { 'Content-Type': 'text/event-stream' } });
  }

  it('shows the text as it arrives, then the whole explanation', async () => {
    apiFetch.mockResolvedValue(
      streamed([
        'event: delta\ndata: {"text":"It turns"}\n\nevent: de',
        'lta\ndata: {"text":" it on."}\n\n',
        'event: done\ndata: {"text":"It turns it on.","model":"qwen","node":"host2","elapsedMs":900,"source":"model"}\n\n',
      ]),
    );
    const seen: string[] = [];
    const result = await streamExplanation(setting, (t) => seen.push(t));
    expect(seen).toEqual(['It turns', 'It turns it on.']);
    expect(result).toEqual({
      ok: true,
      explanation: { text: 'It turns it on.', model: 'qwen', node: 'host2', elapsedMs: 900, source: 'model' },
    });
    const [path, init] = apiFetch.mock.calls.at(-1)!;
    expect(path).toBe('/api/explain');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ subject: setting });
  });

  it('keeps where a remembered or prepared answer came from (EX-27)', async () => {
    apiFetch.mockResolvedValue(
      streamed([
        'event: done\ndata: {"text":"Prepared.","model":"qwen","node":"n","elapsedMs":0,"source":"prepared","preparedFor":"2026.9.27"}\n\n',
      ]),
    );
    const result = await streamExplanation(setting, () => {});
    expect(result).toMatchObject({ ok: true, explanation: { source: 'prepared', preparedFor: '2026.9.27' } });
  });

  it('words a refusal as the JMAP call does', async () => {
    apiFetch.mockResolvedValue(streamed(['event: error\ndata: {"type":"serverFail","description":"busy"}\n\n']));
    expect(await streamExplanation(setting, () => {})).toEqual({ ok: false, failure: { kind: 'busy' } });
  });

  it('falls back to the JMAP call on a server without the stream', async () => {
    apiFetch.mockResolvedValue(new Response('not found', { status: 404 }));
    jmapRequest.mockResolvedValue([
      ['inbuxa:Explanation/set', { created: { e: { text: 'Old.', model: 'q', node: 'n', elapsedMs: 1 } } }],
    ]);
    expect(await streamExplanation(setting, () => {})).toMatchObject({ ok: true, explanation: { text: 'Old.' } });
  });

  it('parses one event block', () => {
    expect(parseEvent('event: delta\ndata: {"text":"x"}')).toEqual({ name: 'delta', data: { text: 'x' } });
    expect(parseEvent(': keep-alive')).toBeNull();
    expect(parseEvent('data: {broken')).toBeNull();
  });
});

