/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import type { Filter } from '@/types/schema';
import { buildJmapFilter } from './listFilter';

const dateFilter = [{ field: 'created', type: 'date' }] as Filter[];
const x = (appliedFilters: Record<string, string>) =>
  buildJmapFilter({ appliedFilters, filters: dateFilter, isXPrefixed: true });

describe('buildJmapFilter', () => {
  it('starts from the static filters and adds what the reader picked', () => {
    expect(
      buildJmapFilter({ appliedFilters: { name: 'ann' }, filtersStatic: { kind: 'user' }, isXPrefixed: true }),
    ).toEqual({ kind: 'user', name: 'ann' });
    expect(buildJmapFilter({ appliedFilters: {}, isXPrefixed: false })).toEqual({});
  });

  it('leaves out empty values, and operators on their own', () => {
    expect(
      buildJmapFilter({ appliedFilters: { name: '', size: '5', sizeOp: 'gt', quotaOp: 'lt' }, isXPrefixed: true }),
    ).toEqual({ sizeIsGreaterThan: '5' });
  });

  it.each([
    ['eq', 'size'],
    ['gt', 'sizeIsGreaterThan'],
    ['gte', 'sizeIsGreaterThanOrEqual'],
    ['lt', 'sizeIsLessThan'],
    ['lte', 'sizeIsLessThanOrEqual'],
  ])('names the property for the %s operator: %s', (op, key) => {
    expect(buildJmapFilter({ appliedFilters: { size: '10', sizeOp: op }, isXPrefixed: true })).toEqual({
      [key]: '10',
    });
  });

  describe('a date on an x: object', () => {
    it('covers the whole UTC day when no operator, or eq, is picked', () => {
      const day = {
        createdIsGreaterThanOrEqual: '2026-03-14T00:00:00Z',
        createdIsLessThan: '2026-03-15T00:00:00Z',
      };
      expect(x({ created: '2026-03-14' })).toEqual(day);
      expect(x({ created: '2026-03-14', createdOp: 'eq' })).toEqual(day);
    });

    it('runs the day over into the next month, year and leap day', () => {
      expect(x({ created: '2026-01-31' }).createdIsLessThan).toBe('2026-02-01T00:00:00Z');
      expect(x({ created: '2025-12-31' }).createdIsLessThan).toBe('2026-01-01T00:00:00Z');
      expect(x({ created: '2028-02-28' }).createdIsLessThan).toBe('2028-02-29T00:00:00Z');
      expect(x({ created: '2027-02-28' }).createdIsLessThan).toBe('2027-03-01T00:00:00Z');
    });

    it('compares against midnight UTC for before and after', () => {
      expect(x({ created: '2026-03-14', createdOp: 'gt' })).toEqual({ createdIsGreaterThan: '2026-03-14T00:00:00Z' });
      expect(x({ created: '2026-03-14', createdOp: 'lt' })).toEqual({ createdIsLessThan: '2026-03-14T00:00:00Z' });
    });

    it('sends a full date and time as it is, with the operator', () => {
      expect(x({ created: '2026-03-14T08:30:00Z', createdOp: 'gte' })).toEqual({
        createdIsGreaterThanOrEqual: '2026-03-14T08:30:00Z',
      });
      expect(x({ created: '2026-03-14T08:30:00Z' })).toEqual({ created: '2026-03-14T08:30:00Z' });
    });
  });

  describe('a date on an object without operators', () => {
    const plain = (appliedFilters: Record<string, string>) =>
      buildJmapFilter({ appliedFilters, filters: dateFilter, isXPrefixed: false });

    it('matches midnight UTC of that day exactly', () => {
      expect(plain({ created: '2026-03-14' })).toEqual({ created: '2026-03-14T00:00:00Z' });
    });

    it('sends a full date and time as it is, ignoring any operator', () => {
      expect(plain({ created: '2026-03-14T08:30:00Z', createdOp: 'gt' })).toEqual({
        created: '2026-03-14T08:30:00Z',
      });
    });
  });
});
