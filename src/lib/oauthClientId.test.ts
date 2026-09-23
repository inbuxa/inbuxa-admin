/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

const originalHead = document.head.innerHTML;

async function loadWithMeta(meta: string) {
  document.head.innerHTML = meta;
  vi.resetModules();
  const { getOAuthClientId } = await import('./oauthClientId');
  return getOAuthClientId;
}

afterEach(() => {
  document.head.innerHTML = originalHead;
  vi.resetModules();
});

describe('getOAuthClientId', () => {
  it('prefers the client id injected by the server', async () => {
    const getOAuthClientId = await loadWithMeta('<meta name="oauth-client-id" content="pocket-id-client" />');
    expect(getOAuthClientId()).toBe('pocket-id-client');
  });

  it('trims surrounding whitespace from the injected client id', async () => {
    const getOAuthClientId = await loadWithMeta('<meta name="oauth-client-id" content="  pocket-id-client  " />');
    expect(getOAuthClientId()).toBe('pocket-id-client');
  });

  it('falls back to the built-in default when the placeholder is empty', async () => {
    const getOAuthClientId = await loadWithMeta('<meta name="oauth-client-id" content="" />');
    expect(getOAuthClientId()).toBe('inbuxa-webui');
  });

  it('falls back to the built-in default when the placeholder is only whitespace', async () => {
    const getOAuthClientId = await loadWithMeta('<meta name="oauth-client-id" content="   " />');
    expect(getOAuthClientId()).toBe('inbuxa-webui');
  });

  it('falls back to the built-in default when the placeholder is absent', async () => {
    const getOAuthClientId = await loadWithMeta('');
    expect(getOAuthClientId()).toBe('inbuxa-webui');
  });

  it('is inbuxa-admin when hosted apart from the server', async () => {
    const getOAuthClientId = await loadWithMeta(
      '<meta name="oauth-client-id" content="" /><meta name="api-base-url" content="https://mail.example.org" />',
    );
    expect(getOAuthClientId()).toBe('inbuxa-admin');
  });

  it('still prefers an injected client id when hosted apart from the server', async () => {
    const getOAuthClientId = await loadWithMeta(
      '<meta name="oauth-client-id" content="custom" /><meta name="api-base-url" content="https://mail.example.org" />',
    );
    expect(getOAuthClientId()).toBe('custom');
  });

  it('reads the document only once', async () => {
    const getOAuthClientId = await loadWithMeta('<meta name="oauth-client-id" content="pocket-id-client" />');
    expect(getOAuthClientId()).toBe('pocket-id-client');

    document.head.innerHTML = '<meta name="oauth-client-id" content="changed-later" />';
    expect(getOAuthClientId()).toBe('pocket-id-client');
  });
});
