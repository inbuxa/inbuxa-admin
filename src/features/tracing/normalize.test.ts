/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { normalizeTraceEvents } from './normalize';

describe('normalizeTraceEvents', () => {
  it('turns JMAP maps into arrays, in index order, all the way down', () => {
    expect(
      normalizeTraceEvents({
        1: { event: 'b', timestamp: 't2', keyValues: [] },
        0: {
          event: 'a',
          timestamp: 't1',
          keyValues: {
            1: {
              key: 'list',
              value: {
                '@type': 'List',
                value: { 1: { '@type': 'Integer', value: 2 }, 0: { '@type': 'Integer', value: 1 } },
              },
            },
            0: {
              key: 'cause',
              value: {
                '@type': 'Event',
                event: 'inner',
                value: { 0: { key: 'n', value: { '@type': 'Boolean', value: true } } },
              },
            },
          },
        },
      }),
    ).toEqual([
      {
        event: 'a',
        timestamp: 't1',
        keyValues: [
          {
            key: 'cause',
            value: {
              '@type': 'Event',
              event: 'inner',
              value: [{ key: 'n', value: { '@type': 'Boolean', value: true } }],
            },
          },
          {
            key: 'list',
            value: {
              '@type': 'List',
              value: [
                { '@type': 'Integer', value: 1 },
                { '@type': 'Integer', value: 2 },
              ],
            },
          },
        ],
      },
      { event: 'b', timestamp: 't2', keyValues: [] },
    ]);
  });

  it('fills in what is missing', () => {
    expect(normalizeTraceEvents([{ keyValues: [{ value: 'not an object' }, {}] }])).toEqual([
      {
        event: '',
        timestamp: '',
        keyValues: [
          { key: '', value: { '@type': 'Null' } },
          { key: '', value: { '@type': 'Null' } },
        ],
      },
    ]);
    expect(normalizeTraceEvents(null)).toEqual([]);
  });
});
