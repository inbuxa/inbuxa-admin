/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useAuthStore } from '@/stores/authStore';
import { buildEndSessionUrl, getPostLogoutRedirectUri } from './oauth';

/** Sign out here, then at the identity provider when it has an end-session endpoint. Used by the account menu and the command palette. */
export function signOut(navigate: (to: string) => void): void {
  const endSessionEndpoint = useAuthStore.getState().endSessionEndpoint;
  useAuthStore.getState().logout();
  if (endSessionEndpoint) {
    window.location.href = buildEndSessionUrl(endSessionEndpoint, getPostLogoutRedirectUri());
  } else {
    navigate('/login');
  }
}
