/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the first domain on a server gets a moment of its own (admin UX
 * roadmap, item 12). After a domain is created, ask how many there are; if
 * this is the only one, the celebration opens.
 */

import { create } from 'zustand';
import { getAccountId, jmapRequest } from '@/services/jmap/client';

interface State {
  domain: { id: string; name: string } | null;
  close: () => void;
}

export const useFirstDomain = create<State>((set) => ({
  domain: null,
  close: () => set({ domain: null }),
}));

/** Opens the celebration when the domain just created is the server's only one. */
export async function celebrateIfFirstDomain(id: string, name: string): Promise<void> {
  try {
    const accountId = getAccountId('x:Domain');
    const responses = await jmapRequest([['x:Domain/query', { accountId, limit: 2, calculateTotal: true }, 'q']]);
    const result = responses[0]?.[1] as { total?: number; ids?: string[] } | undefined;
    const count = result?.total ?? result?.ids?.length;
    if (count === 1) useFirstDomain.setState({ domain: { id, name } });
  } catch {
    // A celebration is never worth an error message.
  }
}
