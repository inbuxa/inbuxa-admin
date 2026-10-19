/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import type { TFunction } from 'i18next';
import { recordFrom, recordTitle } from './recordView';
import type { JmapMethodResponse } from '@/types/jmap';
import type { List } from '@/types/schema';

const t = ((_key: string, fallback: string) => fallback) as unknown as TFunction;

describe('recordFrom', () => {
  it('takes the first record of the get answer', () => {
    const responses = [
      ['x:Domain/query', { ids: ['b'] }, '0'],
      ['x:Domain/get', { list: [{ id: 'b', name: 'example.test' }, { id: 'c' }] }, '0'],
    ] as unknown as JmapMethodResponse[];
    expect(recordFrom(responses, t)).toEqual({ id: 'b', name: 'example.test' });
  });

  it('says what went wrong without one', () => {
    expect(() => recordFrom([], t)).toThrow('No get response');
    const empty = [['x:Domain/get', { list: [], notFound: ['b'] }, '0']] as unknown as JmapMethodResponse[];
    expect(() => recordFrom(empty, t)).toThrow('Object not found');
  });
});

describe('recordTitle', () => {
  const list = { singularName: 'domain', labelProperty: 'name', columns: [{ name: 'id' }] } as unknown as List;

  it('names the kind, then the record by its label property', () => {
    expect(recordTitle(list, 'x:Domain', { name: 'example.test' })).toBe('Domain: example.test');
  });

  it('falls back to the first column, then to the kind alone', () => {
    const noLabel = { singularName: 'tenant', columns: [{ name: 'description' }] } as unknown as List;
    expect(recordTitle(noLabel, 'x:Tenant', { description: 'Acme' })).toBe('Tenant: Acme');
    expect(recordTitle(noLabel, 'x:Tenant', { description: '' })).toBe('Tenant');
    expect(recordTitle(list, 'x:Domain', {})).toBe('Domain');
  });

  it('uses the object name when there is no list', () => {
    expect(recordTitle(null, 'x:WebHook', { name: 'x' })).toBe('WebHook');
  });
});
