/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { jmapMapToArray } from '@/lib/jmapUtils';
import type { TraceEvent, TraceKeyValue, TraceValue } from './types';

type Raw = Record<string, unknown>;

/**
 * Trace events as the server sends them, stored or live. Lists arrive as
 * JMAP maps ({"0": …, "1": …}), at every level, and become arrays here.
 */
export function normalizeTraceEvents(raw: unknown): TraceEvent[] {
  return jmapMapToArray<Raw>(raw).map((event) => ({
    event: String(event.event ?? ''),
    timestamp: String(event.timestamp ?? ''),
    keyValues: keyValues(event.keyValues),
  }));
}

function keyValues(raw: unknown): TraceKeyValue[] {
  return jmapMapToArray<Raw>(raw).map((kv) => ({ key: String(kv.key ?? ''), value: value(kv.value) }));
}

function value(raw: unknown): TraceValue {
  if (raw === null || typeof raw !== 'object') return { '@type': 'Null' };
  const v = raw as Raw;
  switch (v['@type']) {
    case 'List':
      return { '@type': 'List', value: jmapMapToArray<unknown>(v.value).map(value) };
    case 'Event':
      return { '@type': 'Event', event: String(v.event ?? ''), value: keyValues(v.value) };
    default:
      return raw as TraceValue;
  }
}
