/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// When the server ends a session (it refused to refresh it), signing in again
// brings the reader back to the page they were on. The way out is a full page
// load, which drops the router's state, so the page is kept in sessionStorage
// for that one trip.

import { useAuthStore } from '@/stores/authStore';
import { getBasePath } from '@/lib/basePath';

const RETURN_KEY = 'inbuxa_admin_return_path';

function isAuthPath(path: string): boolean {
  return (
    path === '/login' ||
    path.startsWith('/login?') ||
    path === '/oauth/callback' ||
    path.startsWith('/oauth/callback?')
  );
}

/** Sign out because the server ended the session, coming back here after signing in again. */
export function endSession(
  go: (url: string) => void = (url) => {
    window.location.href = url;
  },
): void {
  const basePath = getBasePath();
  const here = window.location.pathname + window.location.search;
  const path = basePath && here.startsWith(basePath) ? here.slice(basePath.length) || '/' : here;
  try {
    if (isAuthPath(path)) sessionStorage.removeItem(RETURN_KEY);
    else sessionStorage.setItem(RETURN_KEY, path);
  } catch {
    // Storage off: signing in lands on the dashboard.
  }
  useAuthStore.getState().logout();
  go(`${basePath}/login`);
}

/** The page an ended session was on, if signing in hasn't taken it back there yet. */
export function readReturnPath(): string | null {
  try {
    return sessionStorage.getItem(RETURN_KEY);
  } catch {
    return null;
  }
}

export function clearReturnPath(): void {
  try {
    sessionStorage.removeItem(RETURN_KEY);
  } catch {
    // Nothing kept, nothing to clear.
  }
}
