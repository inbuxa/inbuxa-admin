/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Where the server's API is, when the console isn't served by the server itself. */
  readonly VITE_API_BASE_URL: string;
  /** Development only: a token that skips signing in. */
  readonly VITE_ACCESS_TOKEN: string;
  readonly VITE_OAUTH_SCOPES: string;
  /** Development only: log JMAP traffic and form changes (lib/debug.ts). */
  readonly VITE_DEBUG_JMAP?: string;
  readonly VITE_DEBUG_FORMS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** The console's version, set at build time. */
declare const __APP_VERSION__: string;
/** The Sieve playground's page, relative to the console (sieve-playground.ts). */
declare const __SIEVE_PLAYGROUND__: string;
