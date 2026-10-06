/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createContext, useContext } from 'react';
import type { Metric } from './types/metrics';
import type { ServerFacts } from './serverFacts';
import type { ClusterState } from './clusterHealth';

/**
 * What the dashboard shell has already fetched, for the page inside it:
 * fetched once, whichever page is open, and kept as you move between them.
 */
export interface DashboardShared {
  facts: ServerFacts | null;
  /** undefined while loading; null when this server isn't part of a cluster. */
  cluster: ClusterState | null | undefined;
  /** The command center's metrics over the period (mail, security, timings). */
  samples: Metric[];
  live: boolean;
  liveValues: Map<string, number>;
  /** Moves on every refresh, by hand or on the timer. */
  tick: number;
}

export const DashboardContext = createContext<DashboardShared | null>(null);

export function useDashboardShared(): DashboardShared {
  const shared = useContext(DashboardContext);
  if (!shared) throw new Error('useDashboardShared outside the dashboard shell');
  return shared;
}
