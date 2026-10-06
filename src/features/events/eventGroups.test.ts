/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { categoryName, groupEvents } from './eventGroups';

const variants = [
  { name: 'auth.failed', label: 'Authentication failed', explanation: 'A wrong password.' },
  { name: 'auth.success', label: 'Authentication succeeded' },
  { name: 'delivery.delivered', label: 'Message delivered' },
  { name: 'security.ip-blocked', label: 'Blocked IP address', explanation: 'A ban.' },
];

describe('event groups', () => {
  it('group by category, named in words', () => {
    const g = groupEvents(variants);
    expect(g.map((x) => x.name)).toEqual(['Outgoing delivery', 'Security', 'Sign-in']);
    expect(g.find((x) => x.category === 'auth')?.events).toHaveLength(2);
    expect(categoryName('unknown-cat')).toBe('unknown-cat');
  });

  it('search names, labels, explanations and category names', () => {
    expect(groupEvents(variants, 'ban').flatMap((g) => g.events.map((e) => e.name))).toEqual(['security.ip-blocked']);
    expect(groupEvents(variants, 'wrong password').flatMap((g) => g.events.map((e) => e.name))).toEqual([
      'auth.failed',
    ]);
    expect(groupEvents(variants, 'sign-in').flatMap((g) => g.events)).toHaveLength(2);
  });
});
