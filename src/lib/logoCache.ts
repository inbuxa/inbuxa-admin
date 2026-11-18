/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The server's own logo, if an admin set one: probed once per page load and
 * theme by loading `/logo` as an image. Anything that isn't an image (no
 * logo, an error page, no answer) means the inbuxa logo.
 *
 * The dark theme asks for `/logo?theme=dark`, the logo an admin set for dark
 * mode, which the server falls back from to the ordinary one (branding
 * BT-27, inbuxa-server#410). A server that predates it ignores the
 * parameter and answers with the ordinary logo.
 *
 * An image, not a fetch: a logo set as an https URL makes `/logo` redirect to
 * that URL, and a fetch only follows a redirect to another site when that
 * site allows it (CORS), which most image hosts don't (inbuxa-admin#225). An
 * image needs no such permission, the same as the server's sign-in page.
 */
import { getApiBaseUrl } from '@/services/api';

export type LogoTheme = 'light' | 'dark';
export type LogoState = { status: 'loading' } | { status: 'custom'; url: string } | { status: 'default' };

const LOADING: LogoState = { status: 'loading' };
const logos: Record<LogoTheme, LogoState> = { light: LOADING, dark: LOADING };
const requested = new Set<LogoTheme>();
const watchers = new Set<() => void>();

export const getLogoState = (theme: LogoTheme): LogoState => logos[theme];

export function subscribeToLogo(watch: () => void): () => void {
  watchers.add(watch);
  return () => void watchers.delete(watch);
}

/** The theme the page shows now, from the `dark` class the console sets. */
export const currentLogoTheme = (): LogoTheme =>
  document.documentElement.classList.contains('dark') ? 'dark' : 'light';

/** Whether `src` loads as an image; the browser caches it for the `<img>`. */
function loadsAsImage(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

/** Starts the probe for a theme; later calls for it do nothing. */
export function loadLogoOnce(theme: LogoTheme = currentLogoTheme()): void {
  if (requested.has(theme)) return;
  requested.add(theme);
  const url = `${getApiBaseUrl()}/logo${theme === 'dark' ? '?theme=dark' : ''}`;
  void loadsAsImage(url).then((loaded) => {
    logos[theme] = loaded ? { status: 'custom', url } : { status: 'default' };
    for (const watch of watchers) watch();
  });
}
