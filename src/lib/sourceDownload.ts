/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getBasePath } from '@/lib/basePath';

/** Where this build's own source is: written next to the app at build time (see source-archive.ts). */
export function sourceDownloadUrl(): string {
  return `${getBasePath()}/source.tar.gz`;
}
