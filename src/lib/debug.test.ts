/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import { describeInvocations, flagOn } from './debug';

describe('flagOn', () => {
  it('turns on for any value but empty, 0 or false, in development only', () => {
    expect(flagOn('1', true)).toBe(true);
    expect(flagOn('yes', true)).toBe(true);
    expect(flagOn('FALSE', true)).toBe(false);
    expect(flagOn('0', true)).toBe(false);
    expect(flagOn('', true)).toBe(false);
    expect(flagOn(undefined, true)).toBe(false);
    expect(flagOn('1', false)).toBe(false);
  });
});

describe('describeInvocations', () => {
  it('sums up calls and responses', () => {
    expect(
      describeInvocations([
        ['x:Domain/get', { accountId: 'a', ids: null }, 'c0'],
        ['x:Domain/set', { update: { d1: {}, d2: {} }, destroy: ['d3'] }, 'c1'],
        ['x:Domain/query', { ids: ['a', 'b'], total: 2 }, 'c2'],
        ['error', { type: 'forbidden' }, 'c3'],
      ]),
    ).toEqual([
      { method: 'x:Domain/get', callId: 'c0', ids: 'all' },
      { method: 'x:Domain/set', callId: 'c1', update: 2, destroy: 1 },
      { method: 'x:Domain/query', callId: 'c2', ids: 2, total: 2 },
      { method: 'error', callId: 'c3', error: 'forbidden' },
    ]);
  });

  it('copes with anything that is not a list of invocations', () => {
    expect(describeInvocations(undefined)).toEqual([]);
    expect(describeInvocations(['oops'])).toEqual([{ method: '?', callId: '?' }]);
  });
});
