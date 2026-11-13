/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { create } from 'zustand';
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware';
import { useCacheStore } from '@/stores/cacheStore';

/** An account in the JMAP session. */
interface AccountInfo {
  name: string;
  isPersonal: boolean;
}

/** The sign-in, and the JMAP session it opened. */
interface Signin {
  accessToken: string | null;
  refreshToken: string | null;
  /** When the access token stops working, in epoch milliseconds. */
  tokenExpiresAt: number | null;
  tokenEndpoint: string | null;
  /** Where sign-out sends the browser, when the server offers it. */
  endSessionEndpoint: string | null;
  accounts: Record<string, AccountInfo>;
  /** The admin's own account, which holds the `x:` settings. */
  primaryAccountId: string | null;
  /** The account being looked at, for mail and the like. */
  activeAccountId: string | null;
  apiUrl: string | null;
  /** Who is signed in, from the session's `username`. */
  username: string | null;
}

interface AuthState extends Signin {
  /** The server's limits on objects per get and set; the session can lower or raise them. */
  maxObjectsInGet: number;
  maxObjectsInSet: number;

  setTokens: (
    access: string,
    refresh: string,
    expiresIn: number,
    tokenEndpoint: string,
    endSessionEndpoint?: string | null,
  ) => void;
  setSession: (
    accounts: Record<string, AccountInfo>,
    primaryAccountId: string,
    apiUrl: string,
    maxObjectsInGet?: number,
    maxObjectsInSet?: number,
  ) => void;
  switchAccount: (accountId: string) => void;
  setUsername: (username: string | null) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  /** Under a minute left, so the next request refreshes first. */
  isTokenExpiringSoon: () => boolean;
}

const signedOut: Signin = {
  accessToken: null,
  refreshToken: null,
  tokenExpiresAt: null,
  tokenEndpoint: null,
  endSessionEndpoint: null,
  accounts: {},
  primaryAccountId: null,
  activeAccountId: null,
  apiUrl: null,
  username: null,
};

const REFRESH_AHEAD_MS = 60_000;

/*
 * Where the sign-in is kept. By default in session storage: it lasts as long
 * as the tab, and other tabs sign in for themselves. On a device the admin
 * calls their own, "Stay signed in on this device" keeps it in local storage
 * instead, so closing the installed app or the browser doesn't sign them out
 * (#197). The choice belongs to the device and outlives a sign-out; signing
 * out still forgets the tokens wherever they are.
 */
const STAY_KEY = 'inbuxa-stay-signed-in';

function tryStorage<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Whether this device keeps the sign-in after the tab closes. */
export function staysSignedIn(): boolean {
  return tryStorage(() => localStorage.getItem(STAY_KEY) === '1', false);
}

const signinStorage: StateStorage = {
  getItem: (name) => tryStorage(() => (staysSignedIn() ? localStorage : sessionStorage).getItem(name), null),
  setItem: (name, value) =>
    tryStorage(() => {
      const [keep, drop] = staysSignedIn() ? [localStorage, sessionStorage] : [sessionStorage, localStorage];
      keep.setItem(name, value);
      drop.removeItem(name);
    }, undefined),
  removeItem: (name) =>
    tryStorage(() => {
      sessionStorage.removeItem(name);
      localStorage.removeItem(name);
    }, undefined),
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ...signedOut,
      maxObjectsInGet: 500,
      maxObjectsInSet: 500,

      setTokens: (accessToken, refreshToken, expiresIn, tokenEndpoint, endSessionEndpoint) =>
        set({
          accessToken,
          refreshToken,
          tokenExpiresAt: Date.now() + expiresIn * 1000,
          tokenEndpoint,
          endSessionEndpoint: endSessionEndpoint ?? null,
        }),

      setSession: (accounts, primaryAccountId, apiUrl, maxObjectsInGet, maxObjectsInSet) => {
        // A reload keeps the account being looked at, if the session still has it.
        const kept = get().activeAccountId;
        set({
          accounts,
          primaryAccountId,
          activeAccountId: kept && kept in accounts ? kept : primaryAccountId,
          apiUrl,
          ...(maxObjectsInGet !== undefined && { maxObjectsInGet }),
          ...(maxObjectsInSet !== undefined && { maxObjectsInSet }),
        });
      },

      switchAccount: (accountId) => {
        const { accounts, activeAccountId } = get();
        if (accountId === activeAccountId || !(accountId in accounts)) return;
        set({ activeAccountId: accountId });
        // Names and lists belong to the account they were read from.
        useCacheStore.getState().clearAll();
      },

      setUsername: (username) => set({ username }),

      logout: () => set(signedOut),

      isAuthenticated: () => {
        const { accessToken, tokenExpiresAt } = get();
        return accessToken !== null && tokenExpiresAt !== null && Date.now() < tokenExpiresAt;
      },

      isTokenExpiringSoon: () => {
        const { tokenExpiresAt } = get();
        return tokenExpiresAt !== null && tokenExpiresAt - Date.now() < REFRESH_AHEAD_MS;
      },
    }),
    {
      name: 'inbuxa-auth',
      storage: createJSONStorage(() => signinStorage),
      partialize: ({ accessToken, refreshToken, tokenExpiresAt, tokenEndpoint, endSessionEndpoint, activeAccountId }) =>
        ({
          accessToken,
          refreshToken,
          tokenExpiresAt,
          tokenEndpoint,
          endSessionEndpoint,
          activeAccountId,
        }) as AuthState,
    },
  ),
);

/** Turns "Stay signed in on this device" on or off, and moves the current sign-in to match. */
export function setStaySignedIn(on: boolean): void {
  tryStorage(() => (on ? localStorage.setItem(STAY_KEY, '1') : localStorage.removeItem(STAY_KEY)), undefined);
  // Any set writes the sign-in through signinStorage, which now picks the other side.
  useAuthStore.setState({});
}
