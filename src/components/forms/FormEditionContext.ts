/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createContext, useContext } from 'react';

import { useAccountStore } from '@/stores/accountStore';

export type EditionValue = 'enterprise' | 'community' | 'oss';

/** Lets a form show fields as a given edition would (the setup wizard does). */
export const FormEditionContext = createContext<EditionValue | null>(null);

/** The edition a form shows fields for: the nearest FormEditionContext, else the server's. */
export function useEffectiveEdition(): EditionValue {
  const fromForm = useContext(FormEditionContext);
  const fromServer = useAccountStore((s) => s.edition);
  return fromForm ?? fromServer;
}
