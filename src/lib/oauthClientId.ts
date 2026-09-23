/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

// INBUXA requires OAuth clients to be registered, and registers these two on
// every start (inbuxa-server contract C-6). Served by the server itself, this
// is the web interface at /admin, registered as `inbuxa-webui`. Hosted
// anywhere else, with the server's address in <meta name="api-base-url">, it
// is INBUXA Admin, registered as `inbuxa-admin` from INBUXA_ADMIN_URL.
const SERVED_BY_SERVER_CLIENT_ID = 'inbuxa-webui';
const HOSTED_ELSEWHERE_CLIENT_ID = 'inbuxa-admin';

let cached: string | undefined;

function metaContent(name: string): string | undefined {
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content')?.trim() || undefined;
}

export function getOAuthClientId(): string {
  if (cached !== undefined) return cached;

  const hostedElsewhere = Boolean(
    (import.meta.env.VITE_API_BASE_URL as string | undefined) || metaContent('api-base-url'),
  );
  cached =
    metaContent('oauth-client-id') ?? (hostedElsewhere ? HOSTED_ELSEWHERE_CLIENT_ID : SERVED_BY_SERVER_CLIENT_ID);
  return cached;
}
