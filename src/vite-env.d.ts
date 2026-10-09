/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_ACCESS_TOKEN: string;
  readonly VITE_OAUTH_SCOPES: string;
  readonly VITE_DEBUG_JMAP?: string;
  readonly VITE_DEBUG_FORMS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string;
// inbuxa: the Sieve playground's page, relative to the console
// (sieve-playground.ts)
declare const __SIEVE_PLAYGROUND__: string;
