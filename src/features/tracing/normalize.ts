/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { jmapMapToArray } from '@/lib/jmapUtils';
import type { TraceEvent, TraceKeyValue, TraceValue } from './types';

/**
 * Trace events as the server sends them, stored or live: key-values arrive as
 * a JMAP map ({"0": …, "1": …}), not an array.
 */
export function normalizeTraceEvents(raw: unknown): TraceEvent[] {
  const events = jmapMapToArray<Record<string, unknown>>(raw);
  return events.map((evt) => ({
    event: String(evt.event ?? ''),
    timestamp: String(evt.timestamp ?? ''),
    keyValues: normalizeKeyValues(evt.keyValues),
  }));
}

function normalizeKeyValues(raw: unknown): TraceKeyValue[] {
  const kvs = jmapMapToArray<Record<string, unknown>>(raw);
  return kvs.map((kv) => ({
    key: String(kv.key ?? ''),
    value: normalizeTraceValue(kv.value),
  }));
}

function normalizeTraceValue(raw: unknown): TraceValue {
  if (!raw || typeof raw !== 'object') return { '@type': 'Null' };
  const obj = raw as Record<string, unknown>;
  const type = obj['@type'] as string;

  if (type === 'List') {
    return { '@type': 'List', value: jmapMapToArray<unknown>(obj.value).map(normalizeTraceValue) };
  }
  if (type === 'Event') {
    return { '@type': 'Event', event: String(obj.event ?? ''), value: normalizeKeyValues(obj.value) };
  }
  return raw as TraceValue;
}
