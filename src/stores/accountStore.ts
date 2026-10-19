/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { create } from 'zustand';

type Edition = 'enterprise' | 'community' | 'oss';

/** The signed-in admin, from the server's account endpoint. */
interface AccountState {
  permissions: string[];
  edition: Edition;
  locale: string;

  setAccountInfo: (permissions: string[], edition: Edition, locale: string) => void;
  hasPermission: (perm: string) => boolean;
  /** An object permission is its type's prefix and the action, e.g. `sysDomainUpdate`. */
  hasObjectPermission: (prefix: string, action: 'Get' | 'Query' | 'Create' | 'Update' | 'Destroy') => boolean;
}

export const useAccountStore = create<AccountState>()((set, get) => ({
  permissions: [],
  edition: 'community',
  locale: 'en',

  // inbuxa has one edition with every feature, whatever the server reports,
  // so nothing is hidden or disabled as Enterprise-only.
  setAccountInfo: (permissions, _reported, locale) => set({ permissions, edition: 'enterprise', locale }),

  hasPermission: (perm) => get().permissions.includes(perm),

  hasObjectPermission: (prefix, action) => get().hasPermission(prefix + action),
}));
