/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import inbuxaMark from '@/assets/inbuxa-mark.png';

/** Nothing to show yet: the cat, a line saying so, and what to do about it. */
export function EmptyState({ title, hint, action }: { title: ReactNode; hint?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
      <img src={inbuxaMark} alt="" className="mb-1 h-14 w-auto opacity-90 grayscale-[15%]" />
      <p className="font-display text-base font-semibold text-foreground">{title}</p>
      {hint && <p className="max-w-sm text-sm text-muted-foreground">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
