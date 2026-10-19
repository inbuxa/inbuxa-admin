/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/services/api', () => ({ getApiBaseUrl: () => 'https://mail.example' }));

/** A fresh copy of the module, since it fetches once per page load. */
async function load(response: Response | Error) {
  vi.resetModules();
  const fetchMock = vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response)));
  vi.stubGlobal('fetch', fetchMock);
  const mod = await import('./logoCache');
  const changed = vi.fn();
  mod.subscribeToLogo(changed);
  mod.loadLogoOnce();
  mod.loadLogoOnce();
  await vi.waitFor(() => expect(changed).toHaveBeenCalled());
  return { state: mod.getLogoState(), fetchMock };
}

describe('logo cache', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses an image the server sends, fetching it only once', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:logo');
    const { state, fetchMock } = await load(
      new Response(new Blob(['png']), { headers: { 'content-type': 'image/png' } }),
    );
    expect(state).toEqual({ status: 'custom', url: 'blob:logo' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://mail.example/logo');
  });

  it('falls back to the inbuxa logo for anything else', async () => {
    expect((await load(new Response('nope', { status: 404 }))).state).toEqual({ status: 'default' });
    expect((await load(new Response('<html>', { headers: { 'content-type': 'text/html' } }))).state).toEqual({
      status: 'default',
    });
    expect((await load(new Error('offline'))).state).toEqual({ status: 'default' });
  });
});
