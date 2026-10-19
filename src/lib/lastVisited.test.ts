/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Layout, Schema } from '@/types/schema';

const layoutMock = vi.hoisted(() => ({
  accessible: new Set<string>(),
  firstAccessible: null as string | null,
  firstVisible: null as string | null,
}));
vi.mock('@/lib/layout', () => ({
  isLinkAccessible: (_s: unknown, view: string) => layoutMock.accessible.has(view),
  findFirstAccessibleLinkInLayout: () => layoutMock.firstAccessible,
  findFirstVisibleLinkInLayout: () => layoutMock.firstVisible,
}));

import { rememberLastVisited, sectionLandingLink } from './lastVisited';

const schema = {} as Schema;
const settings = { name: 'Settings' } as Layout;
const land = () => sectionLandingLink(schema, settings, 'community', () => true);

describe('last visited page per section', () => {
  // In memory: Node's own `localStorage` global, empty without a storage file, hides happy-dom's.
  beforeAll(() => {
    const store = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      clear: () => store.clear(),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    layoutMock.accessible = new Set(['x:Domain', 'x:Account']);
    layoutMock.firstAccessible = 'x:Overview';
    layoutMock.firstVisible = 'x:Locked';
  });

  it('opens a section on the page last used there', () => {
    rememberLastVisited('Settings', 'x:Domain');
    rememberLastVisited('Management', 'x:Account');
    expect(land()).toBe('x:Domain');
    expect(JSON.parse(localStorage.getItem('inbuxa-last-visited')!)).toEqual({
      Settings: 'x:Domain',
      Management: 'x:Account',
    });
  });

  it('skips a remembered page the admin can no longer open', () => {
    rememberLastVisited('Settings', 'x:Gone');
    expect(land()).toBe('x:Overview');
  });

  it('falls back to the first page shown when none may be opened', () => {
    layoutMock.firstAccessible = null;
    expect(land()).toBe('x:Locked');
  });

  it('ignores garbled storage', () => {
    localStorage.setItem('inbuxa-last-visited', '["x:Domain"]');
    expect(land()).toBe('x:Overview');
    localStorage.setItem('inbuxa-last-visited', '{not json');
    expect(land()).toBe('x:Overview');
    rememberLastVisited('Settings', 'x:Domain');
    expect(land()).toBe('x:Domain');
  });
});
