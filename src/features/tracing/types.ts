/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** A trace: the events of one span, such as an SMTP session, in order. */
export interface Trace {
  events: TraceEvent[];
}

export interface TraceEvent {
  /** The event type, e.g. `smtp.ehlo`; the schema's EventType enum names it for people. */
  event: string;
  keyValues: TraceKeyValue[];
  timestamp: string;
}

export interface TraceKeyValue {
  /** The key; the schema's Key enum names it for people. */
  key: string;
  value: TraceValue;
}

/** A value, tagged with its kind as the server sends it. Durations are in milliseconds. */
export type TraceValue =
  | { '@type': 'String'; value: string }
  | { '@type': 'UnsignedInt'; value: number }
  | { '@type': 'Integer'; value: number }
  | { '@type': 'Boolean'; value: boolean }
  | { '@type': 'Float'; value: number }
  | { '@type': 'UTCDateTime'; value: string }
  | { '@type': 'Duration'; value: number }
  | { '@type': 'IpAddr'; value: string }
  | { '@type': 'List'; value: TraceValue[] }
  /** Another event nested inside this one, such as the cause of an error. */
  | { '@type': 'Event'; event: string; value: TraceKeyValue[] }
  | { '@type': 'Null' };
