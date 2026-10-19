/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { eventTone, idToText, isIdKey, longDuration, offsetFrom, shortDuration, traceSummary } from './format';
import type { TraceEvent } from './types';

describe('idToText', () => {
  it("spells ids in the server's base-32 alphabet", () => {
    expect(idToText(0)).toBe('a');
    expect(idToText(31)).toBe('3');
    expect(idToText(32)).toBe('ba');
    expect(idToText(1234567)).toBe('bfvuh');
    expect(idToText(42.9)).toBe('bk');
  });

  it('takes ids too big for a number as decimal text', () => {
    expect(idToText('18446744073709551615')).toBe('p333333333333');
  });

  it('shows anything that is not a whole number as it came', () => {
    expect(idToText('not a number')).toBe('not a number');
  });
});

describe('isIdKey', () => {
  it('knows ids by name', () => {
    expect(isIdKey('id')).toBe(true);
    expect(isIdKey('queueId')).toBe(true);
    expect(isIdKey('identity')).toBe(false);
    expect(isIdKey('Id')).toBe(true);
  });
});

describe('eventTone', () => {
  it.each([
    ['smtp.error', 'error'],
    ['auth.failed', 'error'],
    ['message.invalid-header', 'error'],
    ['spam.rejected', 'error'],
    ['smtp.connection-start', 'span'],
    ['delivery.attempt-end', 'span'],
    ['smtp.ehlo', 'plain'],
  ] as const)('%s is %s', (event, tone) => {
    expect(eventTone(event)).toBe(tone);
  });
});

describe('durations', () => {
  it('reads an offset from the first event', () => {
    const at = '2026-10-18T10:00:00.000Z';
    const plus = (ms: number) => new Date(Date.parse(at) + ms).toISOString();
    expect(offsetFrom(Date.parse(at), at)).toBe('(+0 ms)');
    expect(offsetFrom(Date.parse(at), plus(-5))).toBe('(+0 ms)');
    expect(offsetFrom(Date.parse(at), plus(250))).toBe('(+250 ms)');
    expect(offsetFrom(Date.parse(at), plus(12_340))).toBe('(+12.3 s)');
    expect(offsetFrom(Date.parse(at), plus(125_000))).toBe('(+2 m 5 s)');
  });

  it('spells durations two ways: spaced in a value, joined in a summary', () => {
    expect(shortDuration(999.6)).toBe('1000 ms');
    expect(shortDuration(1500)).toBe('1.5 s');
    expect(shortDuration(61_000)).toBe('1 m 1 s');
    expect(longDuration(61_000)).toBe('1m 1s');
    expect(longDuration(800)).toBe('800 ms');
  });
});

describe('traceSummary', () => {
  const ev = (event: string, timestamp: string): TraceEvent => ({ event, timestamp, keyValues: [] });
  const label = (name: string) => (name === 'smtp.connection-start' ? 'SMTP connection started' : undefined);

  it('names the span by its first event and times it from first to last', () => {
    expect(
      traceSummary(
        [
          ev('smtp.connection-start', '2026-10-18T10:00:00.000Z'),
          ev('smtp.connection-end', '2026-10-18T10:00:02.500Z'),
        ],
        label,
      ),
    ).toEqual({ span: 'SMTP connection started', startedAt: '2026-10-18T10:00:00.000Z', durationMs: 2500 });
  });

  it('has no duration for a single event, and nothing for none', () => {
    expect(traceSummary([ev('odd.event', '2026-10-18T10:00:00.000Z')], label)).toEqual({
      span: 'odd.event',
      startedAt: '2026-10-18T10:00:00.000Z',
      durationMs: null,
    });
    expect(traceSummary([], label)).toEqual({ span: null, startedAt: null, durationMs: null });
  });
});
