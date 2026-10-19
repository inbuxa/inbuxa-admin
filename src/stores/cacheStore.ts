/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { create } from 'zustand';

/** An object as a picker offers it. */
export interface ObjectListEntry {
  id: string;
  label: string;
}

/**
 * What the console has already looked up for the account being viewed: the
 * names that stand in for ids in lists, and the options pickers offer.
 * Switching accounts clears it.
 */
interface CacheState {
  /** Object type → id → the name shown for it. */
  displayNames: Record<string, Record<string, string>>;
  /** Picker options, by the view or object they list. */
  objectLists: Record<string, ObjectListEntry[]>;

  setDisplayNames: (objectType: string, entries: Record<string, string>) => void;
  getDisplayName: (objectType: string, id: string) => string | undefined;
  setObjectList: (key: string, entries: ObjectListEntry[]) => void;
  invalidateAllObjectLists: () => void;
  clearAll: () => void;
}

export const useCacheStore = create<CacheState>()((set, get) => ({
  displayNames: {},
  objectLists: {},

  setDisplayNames: (objectType, entries) =>
    set(({ displayNames }) => ({
      displayNames: { ...displayNames, [objectType]: { ...displayNames[objectType], ...entries } },
    })),

  getDisplayName: (objectType, id) => get().displayNames[objectType]?.[id],

  setObjectList: (key, entries) => set(({ objectLists }) => ({ objectLists: { ...objectLists, [key]: entries } })),

  invalidateAllObjectLists: () => set({ objectLists: {} }),

  clearAll: () => set({ displayNames: {}, objectLists: {} }),
}));
