/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Links from in-app help to the INBUXA admin manual (MkDocs). Every tooltip
 * and help panel carries a stable id, `x:Domain.dnsManagement` for a field
 * or `x:Domain` for a page, and this is the one place that turns an id into
 * an address. Until a manual is published there is no base URL and no link
 * is shown.
 *
 * The base URL comes from VITE_MANUAL_URL at build time, or from
 * <meta name="manual-url" content="https://…"> at deploy time.
 */
function manualBase(): string | null {
  const fromMeta =
    typeof document !== 'undefined' ? document.querySelector('meta[name="manual-url"]')?.getAttribute('content') : null;
  const base = (fromMeta || (import.meta.env.VITE_MANUAL_URL as string | undefined) || '').trim();
  return base ? base.replace(/\/+$/, '') : null;
}

/**
 * The manual page for a help id: `x:Domain.dnsManagement` becomes
 * `<base>/reference/domain/#dnsmanagement`, `x:Domain` becomes
 * `<base>/reference/domain/`. The manual's page names must follow this.
 */
export function manualUrl(id: string): string | null {
  const base = manualBase();
  if (!base) return null;
  const [object, field] = id.split('.', 2);
  const page = object
    .replace(/^x:/, '')
    .replace(/\//g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
  return `${base}/reference/${page}/${field ? `#${field.toLowerCase()}` : ''}`;
}
