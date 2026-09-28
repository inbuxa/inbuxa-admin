/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:LogSettings`, how long rotated log files are kept
 * (personal-data catalog spec, D1). `keepForDays` null keeps every file.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';
import type { JmapSetError } from '@/types/jmap';
import { INBUXA_CAPABILITY, PolicyUnavailable } from './protocolPolicy';

const OBJECT = 'inbuxa:LogSettings';

/** Days kept, or null for every file. */
export type KeepForDays = number | null;

export function parseKeepForDays(raw: Record<string, unknown>): KeepForDays {
  return typeof raw.keepForDays === 'number' ? raw.keepForDays : null;
}

export async function fetchLogSettings(signal?: AbortSignal): Promise<KeepForDays> {
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
  return parseKeepForDays(item);
}

export async function updateLogSettings(keepForDays: KeepForDays): Promise<void> {
  const accountId = getAccountId('x:Tracer');
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId, update: { singleton: { keepForDays } } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) {
    throw new Error((result as { description?: string } | undefined)?.description ?? 'Request failed');
  }
  const failed = (result as { notUpdated?: Record<string, JmapSetError> | null }).notUpdated?.singleton;
  if (failed) throw new Error(failed.description ?? failed.type);
}

/** Whether a typed value is a whole number of days, at least one. */
export function validDays(value: string): boolean {
  const n = Number(value);
  return value.trim() !== '' && Number.isInteger(n) && n >= 1;
}
