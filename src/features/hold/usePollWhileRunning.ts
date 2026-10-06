/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect } from 'react';
import type { HoldExport } from './holdExport';

/** Refetches every few seconds while any export is still collecting. */
export function usePollWhileRunning(exports: HoldExport[], refetch: () => void) {
  const running = exports.some((e) => e.status === 'running');
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(refetch, 4000);
    return () => window.clearInterval(timer);
  }, [running, refetch]);
}
