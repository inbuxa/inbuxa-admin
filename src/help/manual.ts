/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Links from in-app help to the INBUXA admin manual (MkDocs). Every tooltip
 * and help panel carries a stable id, `x:Domain.dnsManagement` for a field
 * or `x:Domain` for a page, and this is the one place that turns an id into
 * an address.
 *
 * The base URL is <meta name="manual-url" content="https://…"> when a
 * deployment sets one (empty for no links), else VITE_MANUAL_URL from the
 * build, else the public manual at docs.inbuxa.org.
 */

/** The public manual, for the same product: used unless a deployment names its own. */
export const DEFAULT_MANUAL_URL = 'https://docs.inbuxa.org';

function manualBase(): string | null {
  // A deployment's own manual, or none: an empty tag turns the links off
  const meta = typeof document !== 'undefined' ? document.querySelector('meta[name="manual-url"]') : null;
  if (meta) {
    const own = (meta.getAttribute('content') ?? '').trim();
    return own ? own.replace(/\/+$/, '') : null;
  }
  const built = ((import.meta.env.VITE_MANUAL_URL as string | undefined) ?? '').trim();
  return (built || DEFAULT_MANUAL_URL).replace(/\/+$/, '');
}

/**
 * Where a help id's entry is in the manual, relative to its root:
 * `x:Domain.dnsManagement` is `reference/domain/#dnsmanagement`, `x:Domain`
 * is `reference/domain/`. The manual's generator (tools/build-manual.mjs)
 * names its pages and anchors with this same function.
 */
export function manualPath(id: string): string {
  const [object, field] = id.split('.', 2);
  return `reference/${manualPage(object)}/${field ? `#${field.toLowerCase()}` : ''}`;
}

/**
 * The page name for an object, schema or view: `x:DnsServerCloudflare` is
 * `dns-server-cloudflare`. The JMAP objects that aren't the registry's
 * (`AddressBook`, `Calendar`…) get `jmap-` first, or they'd share a page with
 * the settings of the same name (`x:AddressBook`).
 */
export function manualPage(object: string): string {
  const own = object.startsWith('x:') || object.startsWith('CustomComponent/');
  return (own ? object : `jmap-${object}`)
    .replace(/^x:/, '')
    .replace(/\//g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase();
}

/** The manual's address for a help id, or null when there's no manual. */
export function manualUrl(id: string): string | null {
  const base = manualBase();
  return base ? `${base}/${manualPath(id)}` : null;
}
