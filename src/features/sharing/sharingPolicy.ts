/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:SharingPolicy` over JMAP (multi-account spec, MA-C):
 * whether people may share their own mail folders, and add other accounts to
 * the webmail. The server's policy has the id `singleton`; each tenant's has
 * the tenant's id, and can only be stricter than the server's.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';

const INBUXA_CAPABILITY = 'urn:inbuxa:jmap';
const OBJECT = 'inbuxa:SharingPolicy';
export const SERVER = 'singleton';

export type Switch = 'enabled' | 'disabled';

export interface SharingPolicy {
  id: string;
  mailSharing: Switch;
  addAccounts: Switch;
}

export type SharingKey = 'mailSharing' | 'addAccounts';

/** The server doesn't have the switches (an older server). */
export class SharingPolicyUnavailable extends Error {}

function asSwitch(value: unknown): Switch {
  return value === 'disabled' ? 'disabled' : 'enabled';
}

/** The server's policy and, with `tenantId`, that tenant's too. */
export async function fetchSharingPolicies(
  tenantId?: string,
  signal?: AbortSignal,
): Promise<{ server: SharingPolicy; tenant?: SharingPolicy }> {
  const ids = tenantId ? [SERVER, tenantId] : [SERVER];
  const responses = await jmapRequest(
    [[`${OBJECT}/get`, { accountId: getAccountId('x:Account'), ids }, '0']],
    signal,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/get`) {
    const type = (result as { type?: string } | undefined)?.type;
    if (type === 'unknownMethod' || type === 'unknownCapability') throw new SharingPolicyUnavailable(type);
    throw new Error((result as { description?: string } | undefined)?.description ?? 'Request failed');
  }
  const list = ((result as { list?: Record<string, unknown>[] }).list ?? []).map(
    (raw): SharingPolicy => ({
      id: String(raw.id ?? ''),
      mailSharing: asSwitch(raw.mailSharing),
      addAccounts: asSwitch(raw.addAccounts),
    }),
  );
  const server = list.find((p) => p.id === SERVER);
  if (!server) throw new SharingPolicyUnavailable('no server policy');
  return { server, tenant: tenantId ? list.find((p) => p.id === tenantId) : undefined };
}

/** Turns one switch. `null` puts it back to the default, on as far as the server allows. */
export async function setSharingSwitch(id: string, key: SharingKey, value: Switch | null): Promise<void> {
  const responses = await jmapRequest(
    [[`${OBJECT}/set`, { accountId: getAccountId('x:Account'), update: { [id]: { [key]: value } } }, '0']],
    undefined,
    [INBUXA_CAPABILITY],
  );
  const [name, result] = responses[0] ?? [];
  if (name !== `${OBJECT}/set`) throw new Error('Request failed');
  const failed = (result as { notUpdated?: Record<string, { description?: string; type?: string }> }).notUpdated?.[id];
  if (failed) throw new Error(failed.description ?? failed.type ?? 'Not saved');
}

/** What applies inside a tenant: off if either level has it off. */
export function effectiveSwitch(server: SharingPolicy, tenant: SharingPolicy | undefined, key: SharingKey): Switch {
  return server[key] === 'disabled' || tenant?.[key] === 'disabled' ? 'disabled' : 'enabled';
}
