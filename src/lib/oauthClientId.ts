/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The OAuth client the console signs in as. inbuxa only accepts registered
 * clients and registers two on every start (inbuxa-server contract C-6):
 *
 * - `inbuxa-webui`: the console served by the server itself, at /admin;
 * - `inbuxa-admin`: the console hosted anywhere else, which knows the
 *   server's address from VITE_API_BASE_URL or <meta name="api-base-url">.
 *
 * A non-empty <meta name="oauth-client-id"> overrides both. Read once.
 */
let clientId: string | undefined;

const meta = (name: string) =>
  document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || undefined;

export function getOAuthClientId(): string {
  if (clientId === undefined) {
    const elsewhere = !!(import.meta.env.VITE_API_BASE_URL || meta('api-base-url'));
    clientId = meta('oauth-client-id') ?? (elsewhere ? 'inbuxa-admin' : 'inbuxa-webui');
  }
  return clientId;
}
