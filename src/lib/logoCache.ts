/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The server's own logo, if an admin set one: fetched once per page load
 * from `/logo` and kept as an object URL. Anything but an image (no logo, an
 * error page, no answer) means the inbuxa logo.
 */
import { getApiBaseUrl } from '@/services/api';

export type LogoState = { status: 'loading' } | { status: 'custom'; url: string } | { status: 'default' };

let logo: LogoState = { status: 'loading' };
let requested = false;
const watchers = new Set<() => void>();

export const getLogoState = (): LogoState => logo;

export function subscribeToLogo(watch: () => void): () => void {
  watchers.add(watch);
  return () => void watchers.delete(watch);
}

async function fetchLogo(): Promise<string | null> {
  try {
    const res = await fetch(`${getApiBaseUrl()}/logo`);
    if (!res.ok || !res.headers.get('content-type')?.startsWith('image/')) return null;
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

/** Starts the fetch; later calls do nothing. */
export function loadLogoOnce(): void {
  if (requested) return;
  requested = true;
  void fetchLogo().then((url) => {
    logo = url ? { status: 'custom', url } : { status: 'default' };
    for (const watch of watchers) watch();
  });
}
