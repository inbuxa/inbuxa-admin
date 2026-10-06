/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Field, Schema } from '@/types/schema';
import { describeDefault, differsFromDefault } from './defaults';

const schema = {
  enums: {
    Proto: [{ name: 'udp', label: 'UDP' }],
    RecType: [
      { name: 'mx', label: 'MX records' },
      { name: 'spf', label: 'SPF records' },
    ],
  },
  schemas: { 'x:Mgmt': { type: 'multiple', variants: [{ name: 'Manual', label: 'Manual DNS management' }] } },
} as unknown as Schema;
const words = { on: 'On', off: 'Off', none: 'None' };
const f = (type: Record<string, unknown>) => ({ description: '', update: 'mutable', type }) as unknown as Field;

describe('describeDefault', () => {
  it('says defaults the way people would', () => {
    expect(describeDefault(f({ type: 'boolean' }), true, schema, words)).toBe('On');
    expect(describeDefault(f({ type: 'number', format: 'duration' }), 300000, schema, words)).toBe('5m');
    expect(describeDefault(f({ type: 'enum', enumName: 'Proto' }), 'udp', schema, words)).toBe('UDP');
    expect(describeDefault(f({ type: 'object', objectName: 'x:Mgmt' }), { '@type': 'Manual' }, schema, words)).toBe(
      'Manual DNS management',
    );
    expect(
      describeDefault(
        f({ type: 'set', class: { type: 'enum', enumName: 'RecType' } }),
        { mx: true, spf: true },
        schema,
        words,
      ),
    ).toBe('MX records, SPF records');
    expect(describeDefault(f({ type: 'string' }), 'mailto:postmaster', schema, words)).toBe('mailto:postmaster');
  });

  it('stays quiet without a default', () => {
    expect(describeDefault(f({ type: 'string' }), undefined, schema, words)).toBeNull();
  });
});

describe('differsFromDefault', () => {
  it('compares by value, ignoring key order', () => {
    expect(differsFromDefault({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(false);
    expect(differsFromDefault(600000, 300000)).toBe(true);
    expect(differsFromDefault(undefined, 300000)).toBe(false);
    expect(differsFromDefault(true, undefined)).toBe(false);
  });
});
