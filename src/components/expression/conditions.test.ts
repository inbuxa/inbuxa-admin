/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import {
  nextConditionKey,
  withAddedCondition,
  withConditionPart,
  withElse,
  withoutCondition,
  type ExpressionValue,
} from './conditions';

const value: ExpressionValue = {
  match: { '0': { if: 'is_tls', then: "'a'" }, '3': { if: 'local_port == 25', then: "'b'" } },
  else: "'c'",
};

describe('nextConditionKey', () => {
  it('starts at 0 and goes one past the highest numbered key', () => {
    expect(nextConditionKey({})).toBe(0);
    expect(nextConditionKey(value.match)).toBe(4);
  });

  it('ignores keys that are not numbers', () => {
    expect(nextConditionKey({ x: { if: '', then: '' } })).toBe(0);
    expect(nextConditionKey({ x: { if: '', then: '' }, '7': { if: '', then: '' } })).toBe(8);
  });
});

describe('edits', () => {
  it('changes one side of one condition', () => {
    const next = withConditionPart(value, '3', 'then', "'z'");
    expect(next.match['3']).toEqual({ if: 'local_port == 25', then: "'z'" });
    expect(next.match['0']).toBe(value.match['0']);
    expect(next.else).toBe("'c'");
    expect(value.match['3'].then).toBe("'b'");
  });

  it('adds an empty condition at the end', () => {
    const next = withAddedCondition(value, '4');
    expect(Object.keys(next.match)).toEqual(['0', '3', '4']);
    expect(next.match['4']).toEqual({ if: '', then: '' });
  });

  it('removes a condition and keeps the others in order', () => {
    const next = withoutCondition(withAddedCondition(value, '4'), '3');
    expect(Object.keys(next.match)).toEqual(['0', '4']);
    expect(Object.keys(value.match)).toEqual(['0', '3']);
  });

  it('sets the value used when nothing matches', () => {
    expect(withElse(value, "'d'")).toEqual({ ...value, else: "'d'" });
  });
});
