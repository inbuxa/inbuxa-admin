/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_LOG_FILTER,
  componentOf,
  mergeNewer,
  jsonFields,
  parseFields,
  toJsonLines,
  toServerFilter,
  type LogEntry,
} from './logs';

const entry = (id: string, details = ''): LogEntry => ({
  id,
  timestamp: '2026-11-18T10:00:00Z',
  level: 'info',
  event: 'smtp.connection-start',
  details,
});

describe('parseFields', () => {
  it('splits key = value pairs and unquotes strings', () => {
    expect(parseFields('listenerId = "smtp", remoteIp = 192.0.2.1, size = 1024, details = "a\\nb"')).toEqual([
      { key: 'listenerId', value: 'smtp' },
      { key: 'remoteIp', value: '192.0.2.1' },
      { key: 'size', value: '1024' },
      { key: 'details', value: 'a\nb' },
    ]);
  });

  it('keeps commas inside strings, lists and nested events', () => {
    expect(
      parseFields(
        'to = ["a@example.org", "b@example.org"], causedBy = Store error (store.error) { reason = "x, y" }, text = "one, two"',
      ),
    ).toEqual([
      { key: 'to', value: '["a@example.org", "b@example.org"]' },
      { key: 'causedBy', value: 'Store error (store.error) { reason = "x, y" }' },
      { key: 'text', value: 'one, two' },
    ]);
  });

  it('copes with an unescaped quote inside a string', () => {
    expect(parseFields('subject = "say "hi" now", size = 3')).toEqual([
      { key: 'subject', value: 'say "hi" now' },
      { key: 'size', value: '3' },
    ]);
  });

  it('reads the JSON object of a tracer writing JSON lines', () => {
    expect(
      parseFields(
        '{"to":["a@example.org"],"subject":"say \\"hi\\", now","size":12,"tls":true,"causedBy":{"type":"store.error"}}',
      ),
    ).toEqual([
      { key: 'to', value: '["a@example.org"]' },
      { key: 'subject', value: 'say "hi", now' },
      { key: 'size', value: '12' },
      { key: 'tls', value: 'true' },
      { key: 'causedBy', value: '{"type":"store.error"}' },
    ]);
  });

  it('returns no fields for details that are not pairs', () => {
    expect(parseFields('')).toEqual([]);
    expect(parseFields('something went wrong')).toEqual([]);
  });
});

describe('toServerFilter', () => {
  it('sends only what was picked', () => {
    expect(toServerFilter(EMPTY_LOG_FILTER)).toEqual({});
    expect(toServerFilter({ ...EMPTY_LOG_FILTER, level: 'warn', component: ' smtp ', text: 'bounce' })).toEqual({
      level: 'warn',
      event: 'smtp',
      text: 'bounce',
    });
  });

  it('turns a local time range into UTC bounds', () => {
    const filter = toServerFilter({ ...EMPTY_LOG_FILTER, from: '2026-11-18T10:00', to: '2026-11-18T11:30' });
    expect(filter.timestampIsGreaterThanOrEqual).toBe(new Date('2026-11-18T10:00').toISOString().replace('.000', ''));
    expect(filter.timestampIsLessThanOrEqual).toBe(new Date('2026-11-18T11:30').toISOString().replace('.000', ''));
  });
});

describe('mergeNewer', () => {
  it('puts what is new on top', () => {
    const shown = [entry('3'), entry('2'), entry('1')];
    expect(mergeNewer(shown, [entry('5'), entry('4'), entry('3'), entry('2')], 10).map((e) => e.id)).toEqual([
      '5',
      '4',
      '3',
      '2',
      '1',
    ]);
  });

  it('keeps what is shown when nothing is new, and caps the length', () => {
    const shown = [entry('2'), entry('1')];
    expect(mergeNewer(shown, [entry('2'), entry('1')], 10)).toBe(shown);
    expect(mergeNewer(shown, [entry('4'), entry('3'), entry('2')], 3).map((e) => e.id)).toEqual(['4', '3', '2']);
  });

  it('starts over when the newest shown entry is gone from the fresh page', () => {
    const fresh = [entry('9'), entry('8')];
    expect(mergeNewer([entry('2')], fresh, 10)).toBe(fresh);
  });
});

describe('export', () => {
  it('writes one JSON object per line with the fields split out', () => {
    const [line] = toJsonLines([entry('1', 'remoteIp = 192.0.2.1')])
      .trimEnd()
      .split('\n');
    expect(JSON.parse(line)).toMatchObject({
      level: 'info',
      event: 'smtp.connection-start',
      fields: { remoteIp: '192.0.2.1' },
    });
  });

  it('keeps the typed fields of a JSON entry', () => {
    const [line] = toJsonLines([entry('1', '{"size":12,"to":["a@example.org"]}')])
      .trimEnd()
      .split('\n');
    expect(JSON.parse(line).fields).toEqual({ size: 12, to: ['a@example.org'] });
  });

  it('names an event id’s component', () => {
    expect(componentOf('smtp.connection-start')).toBe('smtp');
    expect(componentOf('store')).toBe('store');
  });
});

describe('jsonFields', () => {
  it('reads only a JSON object', () => {
    expect(jsonFields('{"size":12}')).toEqual({ size: 12 });
    expect(jsonFields('size = 12')).toBeNull();
    expect(jsonFields('{not json')).toBeNull();
    expect(jsonFields('[1]')).toBeNull();
  });
});
