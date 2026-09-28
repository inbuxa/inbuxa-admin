/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  EMPTY_INVENTORY_FILTER,
  filterItems,
  itemName,
  retentionText,
  unboundedItems,
  type InventoryItem,
} from './inventory';

const item = (patch: Partial<InventoryItem>): InventoryItem => ({
  id: 'x:UserAccount',
  kind: 'object',
  categories: ['identifier'],
  whose: ['holder'],
  where: ['data-store'],
  scope: 'tenant',
  collected: true,
  retention: { kind: 'object-life' },
  leavesHost: false,
  controlledBy: [],
  endpoints: [],
  ...patch,
});

describe('data inventory', () => {
  it('names catalog ids for people', () => {
    expect(itemName('x:UserAccount')).toBe('User account');
    expect(itemName('inbuxa:AuditEvent')).toBe('Audit event');
    expect(itemName('log-file')).toBe('Log files');
    expect(itemName('x:ArfFeedbackReport')).toBe('Arf feedback report');
  });

  it('says retention as a fact', () => {
    expect(retentionText({ kind: 'days', days: 30 })).toBe('Kept 30 days');
    expect(retentionText({ kind: 'days', days: 1 })).toBe('Kept 1 day');
    expect(retentionText({ kind: 'unbounded' })).toBe('Kept with no limit');
    expect(retentionText({ kind: 'setting', setting: 'x:Jmap.uploadTtl' })).toBe('Set by x:Jmap.uploadTtl');
  });

  it('filters by kind, category, place, and what is collected', () => {
    const items = [
      item({ id: 'a' }),
      item({ id: 'b', kind: 'source', categories: ['network'], where: ['log-file'] }),
      item({ id: 'c', collected: false }),
      item({ id: 'd', where: ['data-store'], leavesHost: true, endpoints: ['db.example.net'] }),
    ];
    const ids = (f: Partial<typeof EMPTY_INVENTORY_FILTER>) =>
      filterItems(items, { ...EMPTY_INVENTORY_FILTER, ...f }).map((i) => i.id);
    expect(ids({})).toEqual(['a', 'b', 'd']);
    expect(ids({ onlyCollected: false })).toEqual(['a', 'b', 'c', 'd']);
    expect(ids({ kind: 'source' })).toEqual(['b']);
    expect(ids({ category: 'network' })).toEqual(['b']);
    expect(ids({ where: 'external' })).toEqual(['d']);
  });

  it('lists what is kept with no limit', () => {
    const items = [
      item({ id: 'a', retention: { kind: 'unbounded' } }),
      item({ id: 'b', retention: { kind: 'unbounded' }, collected: false }),
      item({ id: 'c', retention: { kind: 'days', days: 3 } }),
    ];
    expect(unboundedItems(items).map((i) => i.id)).toEqual(['a']);
  });
});
