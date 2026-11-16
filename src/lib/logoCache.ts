/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The server's own logo, if an admin set one: probed once per page load by
 * loading `/logo` as an image. Anything that isn't an image (no logo, an
 * error page, no answer) means the inbuxa logo.
 *
 * An image, not a fetch: a logo set as an https URL makes `/logo` redirect to
 * that URL, and a fetch only follows a redirect to another site when that
 * site allows it (CORS), which most image hosts don't (inbuxa-admin#225). An
 * image needs no such permission, the same as the server's sign-in page.
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

/** Whether `src` loads as an image; the browser caches it for the `<img>`. */
function loadsAsImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

/** Starts the probe; later calls do nothing. */
export function loadLogoOnce(): void {
  if (requested) return;
  requested = true;
  const url = `${getApiBaseUrl()}/logo`;
  void loadsAsImage(url).then((loaded) => {
    logo = loaded ? { status: 'custom', url } : { status: 'default' };
    for (const watch of watchers) watch();
  });
}
