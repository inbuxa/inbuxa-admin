/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { create } from 'zustand';

interface ConnectionState {
  /** The last token refresh got no answer from the server, or a passing error. */
  unreachable: boolean;
  setUnreachable: (unreachable: boolean) => void;
}

export const useConnectionStore = create<ConnectionState>()((set) => ({
  unreachable: false,
  setUnreachable: (unreachable) => set({ unreachable }),
}));
