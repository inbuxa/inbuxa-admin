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
async function load(loads: boolean) {
  vi.resetModules();
  const image = fakeImage(loads);
  const mod = await import('./logoCache');
  const changed = vi.fn();
  mod.subscribeToLogo(changed);
  expect(mod.getLogoState()).toEqual({ status: 'loading' });
  mod.loadLogoOnce();
  mod.loadLogoOnce();
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  return { state: mod.getLogoState(), ...image };
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
});
