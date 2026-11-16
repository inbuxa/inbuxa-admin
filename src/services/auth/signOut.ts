/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useAuthStore } from '@/stores/authStore';
import { buildEndSessionUrl, getPostLogoutRedirectUri } from './oauth';

/**
 * Sign out here, then at the identity provider when it has an end-session
 * endpoint. Used by the account menu and the command palette. Both ways
 * replace the current page in the history, so Back after signing out doesn't
 * return to a console page that would only send the reader to sign in (#215).
 */
export function signOut(navigate: (to: string, options?: { replace?: boolean }) => void): void {
  const endSessionEndpoint = useAuthStore.getState().endSessionEndpoint;
  useAuthStore.getState().logout();
  if (endSessionEndpoint) {
    window.location.replace(buildEndSessionUrl(endSessionEndpoint, getPostLogoutRedirectUri()));
  } else {
    navigate('/login', { replace: true });
  }
}
