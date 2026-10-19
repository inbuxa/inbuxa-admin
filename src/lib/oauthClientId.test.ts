/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

/** The client id a fresh page with this <head> would use. */
async function clientIdFor(head: string) {
  document.head.innerHTML = head;
  vi.resetModules();
  return (await import('./oauthClientId')).getOAuthClientId;
}

afterEach(() => {
  document.head.innerHTML = '';
});

describe('getOAuthClientId', () => {
  it('is inbuxa-webui when the server serves the console', async () => {
    expect((await clientIdFor(''))()).toBe('inbuxa-webui');
    expect((await clientIdFor('<meta name="oauth-client-id" content="  " />'))()).toBe('inbuxa-webui');
  });

  it("is inbuxa-admin when the console is hosted apart, knowing the server's address", async () => {
    expect((await clientIdFor('<meta name="api-base-url" content="https://mail.example.org" />'))()).toBe(
      'inbuxa-admin',
    );
  });

  it('takes a client id the page names, trimmed, either way', async () => {
    expect((await clientIdFor('<meta name="oauth-client-id" content=" sso-console " />'))()).toBe('sso-console');
    expect(
      (
        await clientIdFor(
          '<meta name="oauth-client-id" content="sso-console" /><meta name="api-base-url" content="https://mail.example.org" />',
        )
      )(),
    ).toBe('sso-console');
  });

  it('reads the page once', async () => {
    const get = await clientIdFor('<meta name="oauth-client-id" content="first" />');
    expect(get()).toBe('first');
    document.head.innerHTML = '<meta name="oauth-client-id" content="second" />';
    expect(get()).toBe('first');
  });
});
