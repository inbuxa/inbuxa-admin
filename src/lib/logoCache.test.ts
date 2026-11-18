/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({ getApiBaseUrl: () => 'https://mail.example' }));

/** An `Image` that loads, or fails, the way the browser would for `/logo`. */
function fakeImage(loads: boolean) {
  const sources: string[] = [];
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(value: string) {
      sources.push(value);
      queueMicrotask(() => (loads ? this.onload?.() : this.onerror?.()));
    }
  }
  vi.stubGlobal('Image', FakeImage);
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  return { sources, fetchMock };
}

/** A fresh copy of the module, since it probes once per page load. */
async function load(loads: boolean, theme: 'light' | 'dark' = 'light') {
  vi.resetModules();
  const image = fakeImage(loads);
  const mod = await import('./logoCache');
  const changed = vi.fn();
  mod.subscribeToLogo(changed);
  expect(mod.getLogoState(theme)).toEqual({ status: 'loading' });
  mod.loadLogoOnce(theme);
  mod.loadLogoOnce(theme);
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  return { state: mod.getLogoState(theme), mod, ...image };
}

describe('logo cache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('shows the server logo when /logo loads as an image, probing only once', async () => {
    const { state, sources } = await load(true);
    expect(state).toEqual({ status: 'custom', url: 'https://mail.example/logo' });
    expect(sources).toEqual(['https://mail.example/logo']);
  });

  // inbuxa-admin#225: a logo set as an https URL makes /logo redirect to
  // another site. A fetch needs that site's CORS permission to follow it; an
  // image doesn't, so the console must never fetch the logo.
  it('loads it as an image, never with fetch', async () => {
    const { fetchMock } = await load(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the inbuxa logo when /logo is not an image', async () => {
    expect((await load(false)).state).toEqual({ status: 'default' });
  });

  // inbuxa-server#410: the dark theme asks for the logo set for dark mode
  it('asks for the dark-mode logo in the dark theme, apart from the light one', async () => {
    const { state, sources, mod } = await load(true, 'dark');
    expect(state).toEqual({ status: 'custom', url: 'https://mail.example/logo?theme=dark' });
    expect(sources).toEqual(['https://mail.example/logo?theme=dark']);
    expect(mod.getLogoState('light')).toEqual({ status: 'loading' });
    mod.loadLogoOnce('light');
    await vi.waitFor(() => expect(mod.getLogoState('light')).toEqual({ status: 'custom', url: 'https://mail.example/logo' }));
    expect(sources).toEqual(['https://mail.example/logo?theme=dark', 'https://mail.example/logo']);
  });

  it('follows the page theme when none is given', async () => {
    vi.resetModules();
    const { sources } = fakeImage(true);
    document.documentElement.classList.add('dark');
    try {
      const mod = await import('./logoCache');
      mod.loadLogoOnce();
      expect(sources).toEqual(['https://mail.example/logo?theme=dark']);
    } finally {
      document.documentElement.classList.remove('dark');
    }
  });
});
