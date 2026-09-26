/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: "Explain this" (inbuxa-server's ai-explain spec). The console
 * names what to explain; the server reads the data, builds the prompt and
 * asks the local model on the node that answers. Nothing here sends free
 * text to a model.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { apiFetch } from '@/services/api';
import { INBUXA_CAPABILITY } from '../localAi';

/** What to explain: the `subject` of an `inbuxa:Explanation`. */
export type ExplainSubject =
  | { '@type': 'DeliveryFailure'; queueId: string; recipient: string }
  | {
      '@type': 'SpamVerdict';
      result: string;
      score: number;
      tags: Record<string, { score?: number; disposition?: string }>;
    }
  | { '@type': 'LogEntry'; logId: string }
  | { '@type': 'TraceEvent'; traceId: string; index: number }
  | { '@type': 'TraceEvent'; event: string; keyValues: { key: string; value: string }[] }
  | { '@type': 'Setting'; object: string; id: string; property: string };

export interface Explanation {
  text: string;
  model: string;
  node: string;
  elapsedMs: number;
  /** Where it came from (EX-27): asked now, remembered, or prepared for the release. */
  source: 'model' | 'remembered' | 'prepared';
  /** When a remembered answer was first given. */
  answeredAt?: string;
  /** The release a prepared answer ships with. */
  preparedFor?: string;
}

function explanationFrom(created: Partial<Explanation> & Record<string, unknown>): Explanation {
  const source = created.source === 'remembered' || created.source === 'prepared' ? created.source : 'model';
  return {
    text: String(created.text ?? ''),
    model: String(created.model ?? ''),
    node: String(created.node ?? ''),
    elapsedMs: Number(created.elapsedMs ?? 0),
    source,
    answeredAt: typeof created.answeredAt === 'string' ? created.answeredAt : undefined,
    preparedFor: typeof created.preparedFor === 'string' ? created.preparedFor : undefined,
  };
}

/** Why there's no explanation, in the few kinds the panel words differently (EX-20). */
export type ExplainFailure =
  { kind: 'busy' | 'timeout' | 'paused' | 'unavailable' | 'rateLimit' } | { kind: 'refused'; message: string };

export type ExplainResult = { ok: true; explanation: Explanation } | { ok: false; failure: ExplainFailure };

/** The session's flag (EX-1 to EX-4): Explain is shown only when it's true. */
export function explainAvailable(session: Record<string, unknown>, accountId: string | null): boolean {
  const accounts = session.accounts as Record<string, { accountCapabilities?: Record<string, unknown> }> | undefined;
  const capability = accountId ? accounts?.[accountId]?.accountCapabilities?.[INBUXA_CAPABILITY] : undefined;
  return (capability as { aiExplain?: unknown } | undefined)?.aiExplain === true;
}

// The server's limits (EX-8), kept here so a live event is trimmed rather than refused
const MAX_KEY_VALUES = 50;
const MAX_VALUE_CHARS = 500;
/** Raw protocol bytes: never sent (EX-9). */
const DROPPED_KEYS = new Set(['contents']);

export function isRawEvent(event: string): boolean {
  return event.endsWith('.raw-input') || event.endsWith('.raw-output');
}

/** A trace value as plain text, the way the server flattens a stored one. */
export function valueText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(valueText).filter(Boolean).join(', ');
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => k !== '@type')
      .map(([, v]) => valueText(v))
      .filter(Boolean)
      .join(' ');
  }
  return String(value);
}

/** A live tracing event, trimmed to what the server accepts. */
export function liveEventSubject(event: {
  event: string;
  keyValues: { key: string; value: unknown }[];
}): ExplainSubject {
  const keyValues = event.keyValues
    .filter((kv) => !DROPPED_KEYS.has(kv.key))
    .slice(0, MAX_KEY_VALUES)
    .map((kv) => {
      const text = valueText(kv.value);
      return { key: kv.key, value: text.length > MAX_VALUE_CHARS ? `${text.slice(0, MAX_VALUE_CHARS - 1)}…` : text };
    });
  return { '@type': 'TraceEvent', event: event.event, keyValues };
}

/** The failed recipients of a queued message, as the queue view holds it. */
export function failedRecipients(
  recipients: unknown,
): { address: string; status: 'TemporaryFailure' | 'PermanentFailure'; summary: string }[] {
  if (!recipients || typeof recipients !== 'object') return [];
  const out: { address: string; status: 'TemporaryFailure' | 'PermanentFailure'; summary: string }[] = [];
  for (const [address, rcpt] of Object.entries(recipients as Record<string, unknown>)) {
    const status = (rcpt as { status?: Record<string, unknown> } | null)?.status;
    const type = status?.['@type'];
    if (type !== 'TemporaryFailure' && type !== 'PermanentFailure') continue;
    const code = [status?.responseCode, status?.responseEnhanced].filter((v) => v != null && v !== '').join(' ');
    const words = status?.responseMessage ?? status?.errorMessage ?? status?.errorType ?? '';
    out.push({ address, status: type, summary: [code, String(words)].filter(Boolean).join(' ') });
  }
  return out;
}

function failureFrom(error: { type?: string; description?: string } | undefined): ExplainFailure {
  const type = error?.type;
  const description = error?.description ?? '';
  if (type === 'serverFail') {
    if (description === 'busy' || description === 'timeout' || description === 'paused') return { kind: description };
    return { kind: 'unavailable' };
  }
  if (type === 'rateLimit') return { kind: 'rateLimit' };
  if (type === 'unknownMethod' || type === 'unknownCapability') return { kind: 'unavailable' };
  return { kind: 'refused', message: description || type || 'error' };
}

/** Asks for one explanation. */
export async function requestExplanation(subject: ExplainSubject, signal?: AbortSignal): Promise<ExplainResult> {
  const accountId = getAccountId('x:');
  const responses = await jmapRequest(
    [['inbuxa:Explanation/set', { accountId, create: { e: { subject } } }, '0']],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name === 'error') return { ok: false, failure: failureFrom(result as { type?: string; description?: string }) };
  const body = result as {
    created?: Record<string, Partial<Explanation>>;
    notCreated?: Record<string, { type?: string; description?: string }>;
  };
  const created = body.created?.e;
  if (created && typeof created.text === 'string') {
    return { ok: true, explanation: explanationFrom(created as Partial<Explanation> & Record<string, unknown>) };
  }
  return { ok: false, failure: failureFrom(body.notCreated?.e) };
}

/**
 * Asks for one explanation and shows it as the model writes it (EX-23):
 * `onText` gets the answer so far after each piece. A server without the
 * streaming route gets the ordinary request instead.
 */
export async function streamExplanation(
  subject: ExplainSubject,
  onText: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<ExplainResult> {
  const response = await apiFetch('/api/explain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ subject }),
    signal,
  });
  if (response.status === 404 || response.status === 405 || !response.body) {
    return requestExplanation(subject, signal);
  }
  if (!response.ok) {
    return { ok: false, failure: failureFrom({ type: 'serverFail', description: 'unavailable' }) };
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let soFar = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const event = parseEvent(block);
      if (!event) continue;
      if (event.name === 'delta' && typeof event.data.text === 'string') {
        soFar += event.data.text;
        onText(soFar);
      } else if (event.name === 'done') {
        return { ok: true, explanation: explanationFrom(event.data as Partial<Explanation> & Record<string, unknown>) };
      } else if (event.name === 'error') {
        return { ok: false, failure: failureFrom(event.data as { type?: string; description?: string }) };
      }
    }
  }
  return { ok: false, failure: { kind: 'unavailable' } };
}

/** One server-sent event: its name and JSON data. */
export function parseEvent(block: string): { name: string; data: Record<string, unknown> } | null {
  let name = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) name = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  if (!data.length) return null;
  try {
    return { name, data: JSON.parse(data.join('\n')) as Record<string, unknown> };
  } catch {
    return null;
  }
}

/** The result of Actions › Classify a message, sent back as a verdict. */
export function spamVerdictSubject(result: Record<string, unknown>): ExplainSubject {
  const tags: Record<string, { score?: number; disposition?: string }> = {};
  const raw = result.tags;
  if (raw && typeof raw === 'object') {
    for (const [name, tag] of Object.entries(raw as Record<string, Record<string, unknown> | null>)) {
      tags[name] = {
        score: typeof tag?.score === 'number' ? tag.score : undefined,
        disposition: typeof tag?.disposition === 'string' ? tag.disposition : undefined,
      };
    }
  }
  return {
    '@type': 'SpamVerdict',
    result: String(result.result ?? ''),
    score: typeof result.score === 'number' ? result.score : 0,
    tags,
  };
}

// ── Settings, in inbuxa:AiLimits (EX-21) ─────────────────────────────────

export interface ExplainSettings {
  explainEnabled: boolean;
  /** Unset: the spam classifier's model, or the only model there is (EX-3). */
  explainModelId: string | null;
  explainCallsPerHour: number;
  /** Milliseconds. */
  explainCeiling: number;
}

export const DEFAULT_EXPLAIN: ExplainSettings = {
  explainEnabled: true,
  explainModelId: null,
  explainCallsPerHour: 30,
  explainCeiling: 45_000,
};

export function parseExplainSettings(raw: Record<string, unknown>): ExplainSettings {
  return {
    explainEnabled: typeof raw.explainEnabled === 'boolean' ? raw.explainEnabled : DEFAULT_EXPLAIN.explainEnabled,
    explainModelId: typeof raw.explainModelId === 'string' && raw.explainModelId ? raw.explainModelId : null,
    explainCallsPerHour:
      typeof raw.explainCallsPerHour === 'number' ? raw.explainCallsPerHour : DEFAULT_EXPLAIN.explainCallsPerHour,
    explainCeiling: typeof raw.explainCeiling === 'number' ? raw.explainCeiling : DEFAULT_EXPLAIN.explainCeiling,
  };
}

/** Null when the server predates explanations. */
export async function fetchExplainSettings(signal?: AbortSignal): Promise<ExplainSettings | null> {
  const accountId = getAccountId('x:');
  const responses = await jmapRequest(
    [
      [
        'inbuxa:AiLimits/get',
        {
          accountId,
          ids: null,
          properties: ['explainEnabled', 'explainModelId', 'explainCallsPerHour', 'explainCeiling'],
        },
        '0',
      ],
    ],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name === 'error') return null;
  const row = ((result as { list?: Record<string, unknown>[] }).list ?? [])[0] ?? {};
  // An older server ignores the properties it doesn't know
  if (!('explainEnabled' in row)) return null;
  return parseExplainSettings(row);
}

/**
 * Saves what changed; a value equal to the default goes as null, so the
 * server keeps following the default. The error names the property, if any.
 */
export async function saveExplainSettings(
  current: ExplainSettings,
  next: ExplainSettings,
): Promise<{ ok: boolean; message?: string }> {
  const patch: Record<string, unknown> = {};
  for (const key of Object.keys(DEFAULT_EXPLAIN) as (keyof ExplainSettings)[]) {
    if (next[key] === current[key]) continue;
    patch[key] = next[key] === DEFAULT_EXPLAIN[key] ? null : next[key];
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  const accountId = getAccountId('x:');
  const responses = await jmapRequest(
    [['inbuxa:AiLimits/set', { accountId, update: { singleton: patch } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name === 'error') {
    return { ok: false, message: String((result as { description?: string })?.description ?? 'error') };
  }
  const failure = (result as { notUpdated?: Record<string, { description?: string; type?: string }> }).notUpdated
    ?.singleton;
  return failure ? { ok: false, message: failure.description ?? failure.type } : { ok: true };
}
