/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useCacheStore } from './cacheStore';

const cache = () => useCacheStore.getState();

beforeEach(() => cache().clearAll());

describe('cacheStore', () => {
  it('adds display names to what a type already has, newer names winning', () => {
    cache().setDisplayNames('x:Account', { a1: 'Alice' });
    cache().setDisplayNames('x:Account', { a2: 'Bob', a1: 'Alicia' });
    cache().setDisplayNames('x:Domain', { d1: 'example.com' });
    expect(cache().displayNames).toEqual({
      'x:Account': { a1: 'Alicia', a2: 'Bob' },
      'x:Domain': { d1: 'example.com' },
    });
    expect(cache().getDisplayName('x:Account', 'a2')).toBe('Bob');
    expect(cache().getDisplayName('x:Account', 'a9')).toBeUndefined();
    expect(cache().getDisplayName('x:Group', 'g1')).toBeUndefined();
  });

  it('replaces an object list and drops them all at once', () => {
    cache().setObjectList('x:Domain', [{ id: 'd1', label: 'one' }]);
    cache().setObjectList('x:Domain', [{ id: 'd2', label: 'two' }]);
    cache().setObjectList('x:Role', [{ id: 'r1', label: 'admin' }]);
    expect(cache().objectLists['x:Domain']).toEqual([{ id: 'd2', label: 'two' }]);
    cache().setDisplayNames('x:Domain', { d2: 'two' });
    cache().invalidateAllObjectLists();
    expect(cache().objectLists).toEqual({});
    expect(cache().getDisplayName('x:Domain', 'd2')).toBe('two');
  });

  it('clears everything', () => {
    cache().setDisplayNames('x:Domain', { d1: 'one' });
    cache().setObjectList('x:Domain', [{ id: 'd1', label: 'one' }]);
    cache().clearAll();
    expect(cache()).toMatchObject({ displayNames: {}, objectLists: {} });
  });
});
