/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

let basePath: string | undefined;

/**
 * Where the console is served, from the page's `<base href>`, without the
 * trailing slash: '' at the root, '/admin' under a path. Read once.
 */
export function getBasePath(): string {
  basePath ??= (document.querySelector('base')?.getAttribute('href') ?? '/').replace(/\/+$/, '');
  return basePath;
}
