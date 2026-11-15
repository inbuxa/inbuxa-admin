/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: how Let’s Encrypt reaches this server for names checked without
 * DNS: HTTP-01 on port 80, or TLS-ALPN-01 on port 443. The server answers
 * either. Behind a web server that holds 443, only HTTP-01 works: the
 * installer's Caddy forwards /.well-known/acme-challenge/ on port 80 to the
 * server, and the installer makes an HTTP-01 account for it (#206).
 */

import type { Method } from './names';

export type Direct = 'Http01' | 'TlsAlpn01';

export const PORT: Record<Direct, number> = { Http01: 80, TlsAlpn01: 443 };

/** HTTP-01 when the server already has an account for it, as an installer setup does; otherwise TLS-ALPN-01. */
export function defaultDirect(providers: { challengeType: string }[]): Direct {
  return providers.some((p) => p.challengeType === 'Http01') ? 'Http01' : 'TlsAlpn01';
}

/** The challenge type an account needs for one way of checking names. */
export function challengeOf(method: Method, direct: Direct): string {
  return method === 'dns' ? 'Dns01' : direct;
}
