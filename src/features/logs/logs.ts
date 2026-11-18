/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the Logs page's data (inbuxa-admin #229). Entries come from
 * `x:Log`, which reads the files a Log tracer writes on the node that
 * answers. Each line is `<time> <LEVEL> <description> (<event id>) <fields>`,
 * and the server hands the fields back as one string; `parseFields` splits
 * it into the key = value pairs the tracer wrote.
 */

import { getAccountId, jmapQueryAndGet } from '@/services/jmap/client';
import { listErrorOf } from '@/components/lists/listError';

export const LEVELS = ['error', 'warn', 'info', 'debug', 'trace'] as const;
export type LogLevel = (typeof LEVELS)[number];

export interface LogEntry {
  id: string;
  /** RFC 3339, UTC. */
  timestamp: string;
  level: LogLevel;
  /** The event id, such as `smtp.connection-start`. */
  event: string;
  /** Everything after the event id, as the tracer wrote it. */
  details: string;
}

export interface LogField {
  key: string;
  value: string;
}

/** What the page filters by. Empty strings mean "any". */
export interface LogFilterInput {
  /** This level and everything more severe. */
  level: LogLevel | '';
  /** A component (`smtp`) or a whole event id (`smtp.connection-start`). */
  component: string;
  text: string;
  /** `yyyy-mm-ddThh:mm`, local time, from a datetime-local input. */
  from: string;
  to: string;
}

export const EMPTY_LOG_FILTER: LogFilterInput = { level: '', component: '', text: '', from: '', to: '' };

export const PAGE_SIZE = 100;
/** The most entries one export holds. */
export const EXPORT_MAX = 5000;
const EXPORT_PAGE = 250;

/** A local `datetime-local` value as UTC RFC 3339, whole seconds. */
function toUtc(local: string): string | null {
  const ms = Date.parse(local);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** The server's filter: every condition must hold. */
export function toServerFilter(input: LogFilterInput): Record<string, string> {
  const filter: Record<string, string> = {};
  if (input.level) filter.level = input.level;
  if (input.component.trim()) filter.event = input.component.trim();
  if (input.text.trim()) filter.text = input.text.trim();
  const from = input.from && toUtc(input.from);
  if (from) filter.timestampIsGreaterThanOrEqual = from;
  const to = input.to && toUtc(input.to);
  if (to) filter.timestampIsLessThanOrEqual = to;
  return filter;
}

export function isFiltered(input: LogFilterInput): boolean {
  return Object.values(input).some((v) => v !== '');
}

/** Why a page of logs couldn't be read. */
export class LogsError extends Error {
  /** The server has no Log tracer, so no files to read. */
  readonly noTracer: boolean;
  constructor(message: string, noTracer = false) {
    super(message);
    this.noTracer = noTracer;
  }
}

function normalize(raw: Record<string, unknown>): LogEntry {
  const level = String(raw.level ?? 'info').toLowerCase();
  return {
    id: String(raw.id),
    timestamp: String(raw.timestamp ?? ''),
    level: (LEVELS as readonly string[]).includes(level) ? (level as LogLevel) : 'info',
    event: String(raw.event ?? ''),
    details: String(raw.details ?? ''),
  };
}

/**
 * Entries newest first: the first page, or the page after `anchor`. A page
 * shorter than `limit` is the last one.
 */
export async function queryLogs(
  input: LogFilterInput,
  anchor: string | null,
  limit: number = PAGE_SIZE,
): Promise<LogEntry[]> {
  const filter = toServerFilter(input);
  const responses = await jmapQueryAndGet(
    'x:Log',
    getAccountId('x:Log'),
    {
      ...(Object.keys(filter).length > 0 && { filter }),
      limit,
      ...(anchor ? { anchor, anchorOffset: 1 } : { position: 0 }),
    },
    ['id', 'timestamp', 'level', 'event', 'details'],
  );
  for (const [name, args] of responses) {
    if (name === 'error' || name.endsWith('/error')) {
      const err = listErrorOf('x:Log', (args ?? {}) as Record<string, unknown>, 'Unknown error');
      throw err.kind === 'noLogTracer' ? new LogsError('No log tracer', true) : new LogsError(err.message);
    }
  }
  const ids = ((responses[0]?.[1] as { ids?: string[] }) ?? {}).ids ?? [];
  const list = ((responses[1]?.[1] as { list?: Record<string, unknown>[] }) ?? {}).list ?? [];
  const byId = new Map(list.map((raw) => [String(raw.id), normalize(raw)]));
  return ids.map((id) => byId.get(id)).filter((e): e is LogEntry => !!e);
}

/**
 * What live mode adds to the top: the entries of a fresh first page that are
 * newer than the newest one shown. If that one isn't on the fresh page (a
 * burst of more than a page, or the log files rotated and the ids moved on),
 * the fresh page replaces what's shown.
 */
export function mergeNewer(shown: LogEntry[], fresh: LogEntry[], max: number): LogEntry[] {
  if (shown.length === 0) return fresh;
  const at = fresh.findIndex((e) => e.id === shown[0].id);
  if (at === -1) return fresh;
  if (at === 0) return shown;
  return [...fresh.slice(0, at), ...shown].slice(0, max);
}

/** Every entry the filter finds, newest first, up to `max`. */
export async function collectForExport(input: LogFilterInput, max: number = EXPORT_MAX): Promise<LogEntry[]> {
  const out: LogEntry[] = [];
  let anchor: string | null = null;
  while (out.length < max) {
    const page = await queryLogs(input, anchor, Math.min(EXPORT_PAGE, max - out.length));
    out.push(...page);
    if (page.length < EXPORT_PAGE) break;
    anchor = page[page.length - 1].id;
  }
  return out;
}

/** One JSON object per line, with the fields split out. */
export function toJsonLines(entries: LogEntry[]): string {
  return entries
    .map((e) =>
      JSON.stringify({
        timestamp: e.timestamp,
        level: e.level,
        event: e.event,
        fields: Object.fromEntries(parseFields(e.details).map((f) => [f.key, f.value])),
        details: e.details,
      }),
    )
    .map((line) => line + '\n')
    .join('');
}

/** The lines as the tracer wrote them, give or take the event's description. */
export function toText(entries: LogEntry[]): string {
  return entries.map((e) => `${e.timestamp} ${e.level.toUpperCase()} (${e.event}) ${e.details}\n`).join('');
}

/** The component of an event id: `smtp` for `smtp.connection-start`. */
export function componentOf(event: string): string {
  const dot = event.indexOf('.');
  return dot === -1 ? event : event.slice(0, dot);
}

/** Whether the quote at `i` can end a string: what follows could end a value. */
function closesString(details: string, i: number): boolean {
  const next = details[i + 1];
  return (
    next === undefined ||
    next === ']' ||
    next === '}' ||
    details.startsWith(', ', i + 1) ||
    details.startsWith(' }', i + 1)
  );
}

function unquote(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value;
  return value
    .slice(1, -1)
    .replace(/\\([nrt\\])/g, (_, c: string) => (c === 'n' ? '\n' : c === 'r' ? '\r' : c === 't' ? '\t' : '\\'));
}

/**
 * The `key = value, key = value` pairs of a log line's details. Strings are
 * quoted, nested events sit in `{ }` and lists in `[ ]`, so a comma only
 * separates two fields outside all three. The tracer doesn't escape a quote
 * inside a string, so a quote ends one only when what follows could end a
 * value: the end, `, `, ` }`, `]` or `}`. Details that aren't pairs at all come back as no fields.
 */
export function parseFields(details: string): LogField[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let start = 0;
  for (let i = 0; i < details.length; i++) {
    const c = details[i];
    if (inString) {
      if (c === '\\') i++;
      else if (c === '"' && closesString(details, i)) inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{' || c === '[') depth++;
    else if ((c === '}' || c === ']') && depth > 0) depth--;
    else if (c === ',' && depth === 0 && details[i + 1] === ' ') {
      parts.push(details.slice(start, i));
      start = i + 2;
      i++;
    }
  }
  parts.push(details.slice(start));

  const fields: LogField[] = [];
  for (const part of parts) {
    const eq = part.indexOf(' = ');
    if (eq <= 0) return [];
    const key = part.slice(0, eq).trim();
    if (!/^[A-Za-z][\w.-]*$/.test(key)) return [];
    fields.push({ key, value: unquote(part.slice(eq + 3).trim()) });
  }
  return fields;
}
