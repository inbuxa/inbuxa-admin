/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: local AI spam filtering (inbuxa-server's ai-spam-classification
 * spec). The wire and the rules; the page and the form hooks draw from it.
 *
 * The feature is off until an administrator turns it on, and meant for a
 * model running on the operator's own machines: nothing here presets a hosted
 * endpoint, and the locality check says so when one is chosen (AI-2).
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapMethodResponse, JmapSetError } from '@/types/jmap';

export const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';
const LIMITS = 'inbuxa:AiLimits';
const CLASSIFIER = 'x:SpamLlm';
const MODEL = 'x:AiModel';

/**
 * The fork's default classification prompt, prefilled only when an
 * administrator enables the classifier (spec, "Default prompt"). The
 * calibration measured it; the server adds its own framing around it.
 */
export const DEFAULT_PROMPT =
  'Classify the email below as one of: Unsolicited, Commercial, Harmful, Legitimate. ' +
  "Unsolicited: bulk mail the recipient didn't ask for. Commercial: selling something. " +
  'Harmful: phishing, fraud or malware. Legitimate: anything else. Then give your confidence: ' +
  'High, Medium or Low. Answer on one line as Category,Confidence,Reason with a reason of at most 20 words.';

/** The calibration's recommendation (spec, "Calibration"): Apache-2.0, 4 vCPU minimum on CPU only. */
export const RECOMMENDED_MODEL = {
  label: 'Qwen3 4B Instruct 2507',
  model: 'qwen3-4b-instruct-2507',
  license: 'Apache-2.0',
  minCpus: 4,
};

/** Where a model served beside the mail server usually answers: llama.cpp's server, or Ollama. */
export const EXAMPLE_URLS = {
  llamaCpp: 'http://127.0.0.1:8080/v1/chat/completions',
  ollama: 'http://127.0.0.1:11434/v1/chat/completions',
};

// ── Locality (AI-2) ──────────────────────────────────────────────────────

export type Locality = 'local' | 'unknown' | 'remote' | 'invalid';

function ipv4Octets(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  return o.every((n) => n <= 255) ? o : null;
}

/**
 * Is the endpoint on this network? `local` for localhost, loopback, RFC 1918
 * and RFC 4193 addresses; `remote` for any other address; `unknown` for a
 * name the browser can't resolve, where only the server can tell (it logs
 * its own warning); `invalid` when there's no URL to judge. Advisory only: it
 * never blocks an endpoint the operator chose.
 */
export function locality(url: string): Locality {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'invalid';
  }
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1);
  if (host === 'localhost' || host.endsWith('.localhost')) return 'local';
  const v4 = ipv4Octets(host);
  if (v4) {
    const [a, b] = v4;
    if (a === 127 || a === 10) return 'local';
    if (a === 172 && b >= 16 && b <= 31) return 'local';
    if (a === 192 && b === 168) return 'local';
    return 'remote';
  }
  if (host.includes(':')) {
    if (host === '::1') return 'local';
    const first = parseInt(host.split(':')[0] || '0', 16);
    if ((first & 0xfe00) === 0xfc00) return 'local';
    return 'remote';
  }
  return 'unknown';
}

// ── The limits, inbuxa:AiLimits ──────────────────────────────────────────

export interface AiLimits {
  spamMaxAdded: number;
  spamMaxSubtracted: number;
  /** Milliseconds. */
  spamCallCeiling: number;
  maxConcurrentCalls: number;
  maxContentBytes: number;
  /** Milliseconds. */
  failureBackoff: number;
  userCallsPerHour: number;
}

/** The spec's defaults, which the server also applies to anything unset. */
export const DEFAULT_LIMITS: AiLimits = {
  spamMaxAdded: 2.0,
  spamMaxSubtracted: 1.0,
  spamCallCeiling: 20_000,
  maxConcurrentCalls: 4,
  maxContentBytes: 2048,
  failureBackoff: 60_000,
  userCallsPerHour: 60,
};

export const LIMIT_FIELDS = Object.keys(DEFAULT_LIMITS) as (keyof AiLimits)[];

export class LimitsUnavailable extends Error {}

export function parseLimits(raw: Record<string, unknown>): AiLimits {
  const out = { ...DEFAULT_LIMITS };
  for (const key of LIMIT_FIELDS) {
    const v = raw[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
  }
  return out;
}

function methodError(responses: JmapMethodResponse[]): string | null {
  const [name, result] = responses[0] ?? [];
  if (name !== 'error') return null;
  return typeof result?.description === 'string' ? result.description : String(result?.type ?? 'error');
}

export async function fetchLimits(signal?: AbortSignal): Promise<AiLimits> {
  const accountId = getAccountId('x:');
  const responses = await jmapRequest([[`${LIMITS}/get`, { accountId, ids: null }, '0']], signal, [INBUXA_CAPABILITY]);
  const [name, result] = responses[0] ?? [];
  if (name === 'error') {
    const type = (result as { type?: string } | undefined)?.type;
    if (type === 'unknownMethod' || type === 'unknownCapability') throw new LimitsUnavailable();
    throw new Error(methodError(responses) ?? 'error');
  }
  const list = (result as { list?: Record<string, unknown>[] }).list ?? [];
  return parseLimits(list[0] ?? {});
}

export interface SaveOutcome {
  ok: boolean;
  /** The property the server rejected, and why. */
  property?: string;
  message?: string;
}

/**
 * Saves what changed. A value equal to the default is sent as null, so the
 * server keeps following the default rather than pinning today's number.
 */
export async function saveLimits(current: AiLimits, next: AiLimits): Promise<SaveOutcome> {
  const patch: Record<string, number | null> = {};
  for (const key of LIMIT_FIELDS) {
    if (next[key] === current[key]) continue;
    patch[key] = next[key] === DEFAULT_LIMITS[key] ? null : next[key];
  }
  if (Object.keys(patch).length === 0) return { ok: true };
  const accountId = getAccountId('x:');
  const responses = await jmapRequest(
    [[`${LIMITS}/set`, { accountId, update: { singleton: patch } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const err = methodError(responses);
  if (err) return { ok: false, message: err };
  const notUpdated = (responses[0][1] as { notUpdated?: Record<string, JmapSetError> }).notUpdated;
  const failure = notUpdated?.singleton;
  if (failure) {
    return {
      ok: false,
      property: failure.properties?.[0],
      message: failure.description ?? failure.type,
    };
  }
  return { ok: true };
}

// ── The classifier and its models ────────────────────────────────────────

export interface AiModelSummary {
  id: string;
  name: string;
  model: string;
  url: string;
}

export interface Status {
  enabled: boolean;
  /** The model the classifier asks, when enabled. */
  modelId: string | null;
  models: AiModelSummary[];
}

export async function fetchStatus(signal?: AbortSignal): Promise<Status> {
  const accountId = getAccountId('x:');
  const responses = await jmapRequest(
    [
      [`${CLASSIFIER}/get`, { accountId, ids: ['singleton'] }, 'c'],
      [`${MODEL}/get`, { accountId, ids: null, properties: ['name', 'model', 'url'] }, 'm'],
    ],
    signal,
  );
  const err = methodError(responses);
  if (err) throw new Error(err);
  const classifier = ((responses[0][1] as { list?: Record<string, unknown>[] }).list ?? [])[0] ?? {};
  const models = ((responses[1]?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? []).map((m) => ({
    id: String(m.id),
    name: String(m.name ?? ''),
    model: String(m.model ?? ''),
    url: String(m.url ?? ''),
  }));
  const enabled = classifier['@type'] === 'Enable';
  return { enabled, modelId: enabled ? String(classifier.modelId ?? '') || null : null, models };
}

export interface SetupInput {
  name: string;
  url: string;
  model: string;
  prompt: string;
}

/**
 * The guided setup: makes sure the model exists, then switches the
 * classifier on with it. A model already configured under the same name is
 * reused (and its address and model name updated), so running the setup again
 * after a failure never piles up duplicates. The classifier is only switched
 * on once the model is known to exist, with its real id.
 */
export async function enableWithModel(input: SetupInput, existing: AiModelSummary[]): Promise<SaveOutcome> {
  const accountId = getAccountId('x:');
  const fields = { name: input.name, url: input.url, model: input.model, modelType: 'Chat' };
  const same = existing.find((m) => m.name === input.name);

  let modelId: string;
  if (same) {
    const responses = await jmapRequest([[`${MODEL}/set`, { accountId, update: { [same.id]: fields } }, '0']]);
    const err = methodError(responses);
    if (err) return { ok: false, message: err };
    const f = (responses[0][1] as { notUpdated?: Record<string, JmapSetError> }).notUpdated?.[same.id];
    if (f) return { ok: false, property: f.properties?.[0], message: f.description ?? f.type };
    modelId = same.id;
  } else {
    const responses = await jmapRequest([[`${MODEL}/set`, { accountId, create: { m: fields } }, '0']]);
    const err = methodError(responses);
    if (err) return { ok: false, message: err };
    const result = responses[0][1] as {
      created?: Record<string, { id?: string }>;
      notCreated?: Record<string, JmapSetError>;
    };
    const f = result.notCreated?.m;
    if (f) return { ok: false, property: f.properties?.[0], message: f.description ?? f.type };
    const id = result.created?.m?.id;
    if (!id) return { ok: false, message: 'The server created the model but did not return its id.' };
    modelId = id;
  }

  const responses = await jmapRequest([
    [
      `${CLASSIFIER}/set`,
      { accountId, update: { singleton: { '@type': 'Enable', modelId, prompt: input.prompt } } },
      '0',
    ],
  ]);
  const err = methodError(responses);
  if (err) return { ok: false, message: err };
  const f = (responses[0][1] as { notUpdated?: Record<string, JmapSetError> }).notUpdated?.singleton;
  if (f) return { ok: false, property: f.properties?.[0], message: f.description ?? f.type };
  return { ok: true };
}

/** Switches the classifier off. The model stays configured, for turning it back on. */
export async function disableClassifier(): Promise<SaveOutcome> {
  const accountId = getAccountId('x:');
  const responses = await jmapRequest([
    [`${CLASSIFIER}/set`, { accountId, update: { singleton: { '@type': 'Disable' } } }, '0'],
  ]);
  const err = methodError(responses);
  if (err) return { ok: false, message: err };
  const f = (responses[0][1] as { notUpdated?: Record<string, JmapSetError> }).notUpdated?.singleton;
  return f ? { ok: false, message: f.description ?? f.type } : { ok: true };
}
