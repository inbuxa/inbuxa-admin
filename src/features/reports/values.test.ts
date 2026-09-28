/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { addressSet, failureOf, failuresTogether, frequencyOf, plain } from './values';

describe('report values', () => {
  it('read plain values and leave conditions alone', () => {
    expect(plain({ match: {}, else: 'daily' })).toBe('daily');
    expect(plain({ match: { '0': { if: 'x', then: 'y' } }, else: 'daily' })).toBeNull();
    expect(frequencyOf({ match: {}, else: 'weekly' })).toBe('weekly');
    expect(frequencyOf({ match: {}, else: "'weekly'" })).toBeNull();
  });

  it('tell a rate from no rate', () => {
    expect(failureOf({ match: {}, else: '[1, 1d]' })).toBe('on');
    expect(failureOf({ match: {}, else: '[5, 1h]' })).toBe('on');
    expect(failureOf({ match: {}, else: 'false' })).toBe('off');
    expect(failureOf({ match: { '0': { if: 'a', then: 'b' } }, else: 'false' })).toBeNull();
  });

  it('read the three failure switches together', () => {
    const on = { match: {}, else: '[1, 1d]' };
    const off = { match: {}, else: 'false' };
    expect(failuresTogether([on, on, on])).toBe('on');
    expect(failuresTogether([off, off, off])).toBe('off');
    expect(failuresTogether([on, off, on])).toBe('mixed');
  });

  it('turn a typed list of addresses into a set', () => {
    expect(addressSet(' postmaster@*, DMARC@example.org\nabuse@x.org ')).toEqual({
      'postmaster@*': true,
      'dmarc@example.org': true,
      'abuse@x.org': true,
    });
  });
});
