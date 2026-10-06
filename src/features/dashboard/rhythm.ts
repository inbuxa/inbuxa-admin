/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Metric } from './types/metrics';

/** Received plus sent: every message the server handled. */
export const RHYTHM_METRICS = [
  'queue.message-queued',
  'queue.authenticated-message-queued',
  'queue.dsn-queued',
  'queue.report-queued',
];

/** Sum the samples into a 7×24 grid, Monday first, in the viewer's time zone. */
export function weeklyGrid(samples: Metric[], metrics: string[] = RHYTHM_METRICS): number[][] {
  const want = new Set(metrics);
  const grid = Array.from({ length: 7 }, () => new Array<number>(24).fill(0));
  for (const s of samples) {
    if (!want.has(s.metric) || !s.timestamp) continue;
    const d = new Date(s.timestamp);
    if (Number.isNaN(d.getTime())) continue;
    grid[(d.getDay() + 6) % 7][d.getHours()] += s.count;
  }
  return grid;
}
