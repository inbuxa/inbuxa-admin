/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:CountSettings`, the opt-in "count this server" setting.
 * Off by default. Once a week, while on, the server POSTs `preview` (a random
 * ID and its version, nothing else) to `endpoint`. Off means no network
 * activity at all. `decided` records that the operator has answered the
 * one-time question on Settings › Overview, either way.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapSetError } from '@/types/jmap';
import { INBUXA_CAPABILITY, PolicyUnavailable } from '@/features/hardening/protocolPolicy';

const OBJECT = 'inbuxa:CountSettings';

/** The console's page for it, under Settings › System › Server. */
export const SERVER_COUNT_VIEW = 'CustomComponent/ServerCount';

export const DEFAULT_ENDPOINT = 'https://inbuxa.org/count/v1';
export const COUNT_DOCS_URL = 'https://docs.inbuxa.org/count/';
export const COUNT_SOURCE_URL = 'https://git.coffeylabs.org/inbuxa/inbuxa-count';

export interface CountSettings {
  enabled: boolean;
  /** Whether the operator has answered the one-time question. */
  decided: boolean;
  endpoint: string;
  /** The random ID sent each week; null while off. */
  installId: string | null;
  /** The last day the collector took a check-in, "YYYY-MM-DD"; null before the first. */
  lastCheckIn: string | null;
  /** The exact JSON body sent each week, as the server will send it. */
  preview: string;
}

/** What a /set may change; the rest is the server's. */
export type CountSettingsUpdate = Partial<Pick<CountSettings, 'enabled' | 'decided' | 'endpoint'>>;

/** A /set the server refused, with its reason and the properties it names. */
export class CountSettingsRefused extends Error {
  readonly properties: string[];
  constructor(message: string, properties: string[] = []) {
    super(message);
    this.properties = properties;
  }
}

const str = (value: unknown): string | null => (typeof value === 'string' && value !== '' ? value : null);

export function parseCountSettings(raw: Record<string, unknown>): CountSettings {
  return {
    enabled: raw.enabled === true,
    decided: raw.decided === true,
    endpoint: str(raw.endpoint) ?? DEFAULT_ENDPOINT,
    installId: str(raw.installId),
    lastCheckIn: str(raw.lastCheckIn),
    preview: typeof raw.preview === 'string' ? raw.preview : '',
  };
}

/** The setting, or PolicyUnavailable from a server without it. */
export async function fetchCountSettings(signal?: AbortSignal): Promise<CountSettings> {
  const accountId = getAccountId('x:Tracer');
  const responses = await jmapRequest([[`${OBJECT}/get`, { accountId, ids: null }, '0']], signal, [INBUXA_CAPABILITY]);
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) {
    const type = (result as { type?: string } | undefined)?.type;
    if (type === 'unknownMethod' || type === 'unknownCapability') throw new PolicyUnavailable(type);
    throw new Error((result as { description?: string } | undefined)?.description ?? type ?? 'Request failed');
  }
  const item = (result as { list?: Record<string, unknown>[] }).list?.[0];
  if (!item) throw new PolicyUnavailable('notFound');
  return parseCountSettings(item);
}

export async function updateCountSettings(update: CountSettingsUpdate): Promise<void> {
  const accountId = getAccountId('x:Tracer');
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId, update: { singleton: update } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) {
    throw new Error((result as { description?: string } | undefined)?.description ?? 'Request failed');
  }
  const failed = (result as { notUpdated?: Record<string, JmapSetError> | null }).notUpdated?.singleton;
  if (failed) throw new CountSettingsRefused(failed.description ?? failed.type, failed.properties ?? []);
}

/** Saying yes: counted, and the question answered. */
export const COUNT_YES: CountSettingsUpdate = { enabled: true, decided: true };
/** Saying no: not counted, and never asked again. */
export const COUNT_NO: CountSettingsUpdate = { enabled: false, decided: true };
