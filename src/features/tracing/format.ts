/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** How trace events and their values read on screen. */
import type { TraceEvent } from './types';

/** The server writes ids in base 32 with this alphabet, so a queue id here matches the one in its logs and URLs. */
const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz792013';

/** An id as the server spells it. Very large ids arrive as decimal text; anything else shows as it came. */
export function idToText(id: number | string): string {
  let n: bigint;
  try {
    n = BigInt(typeof id === 'number' ? Math.floor(id) : id);
  } catch {
    return String(id);
  }
  if (n < 0n) return String(id);
  let text = '';
  do {
    text = ID_ALPHABET[Number(n % 32n)] + text;
    n /= 32n;
  } while (n > 0n);
  return text;
}

/** Keys named `id` or ending in `Id` hold ids. */
export const isIdKey = (key: string) => key === 'id' || key.endsWith('Id');

/** Failures get the error icon, span boundaries the clock, the rest a dot. */
export function eventTone(event: string): 'error' | 'span' | 'plain' {
  if (['error', 'failed', 'invalid', 'reject'].some((word) => event.includes(word))) return 'error';
  if (event.endsWith('-start') || event.endsWith('-end')) return 'span';
  return 'plain';
}

/** A duration in a trace value: "250 ms", "1.5 s", "2 m 5 s". */
export function shortDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} m ${Math.floor((ms % 60_000) / 1000)} s`;
}

/** A trace's whole duration in its summary: minutes and seconds run together, "2m 5s". */
export function longDuration(ms: number): string {
  return ms < 60_000 ? shortDuration(ms) : `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

/** How long after the anchor an event happened, "(+250 ms)"; never negative. */
export function offsetFrom(anchorMs: number, timestamp: string): string {
  return `(+${shortDuration(Math.max(0, Date.parse(timestamp) - anchorMs))})`;
}

/** A stored trace in brief: what its first event was, when it started, and how long it ran. */
export function traceSummary(events: TraceEvent[], label: (event: string) => string | undefined) {
  const first = events.at(0);
  const last = events.at(-1);
  return {
    span: first ? (label(first.event) ?? first.event) : null,
    startedAt: first?.timestamp ?? null,
    durationMs: first && last && events.length >= 2 ? Date.parse(last.timestamp) - Date.parse(first.timestamp) : null,
  };
}
