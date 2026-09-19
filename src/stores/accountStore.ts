/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { create } from 'zustand';

type Edition = 'enterprise' | 'community' | 'oss';

interface AccountState {
  permissions: string[];
  edition: Edition;
  locale: string;

  setAccountInfo: (permissions: string[], edition: Edition, locale: string) => void;
  hasPermission: (perm: string) => boolean;
  hasObjectPermission: (prefix: string, action: 'Get' | 'Query' | 'Create' | 'Update' | 'Destroy') => boolean;
}

export const useAccountStore = create<AccountState>()((set, get) => ({
  permissions: [],
  edition: 'community',
  locale: 'en',

  setAccountInfo: (permissions, _edition, locale) => {
    // INBUXA has one edition, with every feature. Whatever the server reports,
    // nothing is hidden or disabled as Enterprise-only. Features the server
    // hasn't rebuilt yet answer that for themselves.
    set({ permissions, edition: 'enterprise', locale });
  },

  hasPermission: (perm) => {
    return get().permissions.includes(perm);
  },

  hasObjectPermission: (prefix, action) => {
    return get().permissions.includes(`${prefix}${action}`);
  },
}));
