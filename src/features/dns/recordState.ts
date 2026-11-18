/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Where each record on the DNS setup pages stands. Like a live check, except
 * that a DMARC or SPF record of the domain's own, which is well formed, is
 * `valid` instead of `different` (#239): the admin chose it, it works, and it
 * counts as done.
 */
import { coreState } from '@/features/hovercards/facts';
import type { LiveResult, LiveState } from './liveCheck';
import type { ZoneRecord } from './zone';

export type RecordState = LiveState | 'valid';

export function recordStates(records: ZoneRecord[], results: Map<ZoneRecord, LiveResult>): Map<ZoneRecord, RecordState> {
  return new Map(
    records.map((r): [ZoneRecord, RecordState] => {
      const result = results.get(r) ?? { state: 'error', found: [] };
      if (result.state === 'different' && (r.kind === 'dmarc' || r.kind === 'spf')) {
        if (coreState(r.kind, [result]) === 'valid') return [r, 'valid'];
      }
      return [r, result.state];
    }),
  );
}

/** Published and usable: the suggested value, or a valid record of the domain's own. */
export function isDone(state: RecordState | undefined): boolean {
  return state === 'live' || state === 'valid';
}
