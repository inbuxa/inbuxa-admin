/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: which saved registry objects the running server has to be told to
 * apply, and how to read its answer when it can't.
 *
 * A write to the registry is stored at once, but most settings only take
 * effect when the server rebuilds its configuration from the registry: the
 * x:Action ReloadSettings action, which also carries the change to every
 * node of a cluster. The server does that by itself on a write for a few
 * types only (directories and the default authentication). Everything else
 * waited for someone to open Management > Actions and reload by hand.
 *
 * A reload is all or nothing: the new configuration replaces the running one
 * only when every settings object builds, so applying straight after a save
 * can't leave the server half configured. When something doesn't build, the
 * server keeps what it had and names the object and the problem.
 */

import i18n from '@/i18n';
import { friendlySetError, validationErrorMessage } from '@/lib/jmapErrors';
import type { JmapMethodCall, JmapMethodResponse, JmapObjectRef, JmapSetError } from '@/types/jmap';

export type ReloadAction = 'ReloadSettings' | 'ReloadTlsCertificates' | 'ReloadLookupStores' | 'ReloadBlockedIps';

/** The order the actions run in when more than one is due. */
export const RELOAD_ORDER: readonly ReloadAction[] = [
  'ReloadLookupStores',
  'ReloadTlsCertificates',
  'ReloadBlockedIps',
  'ReloadSettings',
];

/** Types whose own reload action applies them; the server rebuilds nothing else for these. */
const OWN_ACTION: Record<string, ReloadAction> = {
  Certificate: 'ReloadTlsCertificates',
  StoreLookup: 'ReloadLookupStores',
  HttpLookup: 'ReloadLookupStores',
  MemoryLookupKey: 'ReloadLookupStores',
  MemoryLookupKeyValue: 'ReloadLookupStores',
  BlockedIp: 'ReloadBlockedIps',
};

/** Types that need no reload after a write. Anything not listed here is reloaded. */
const NOTHING_TO_APPLY = new Set<string>([
  // The server reloads these itself on every write, here and on every node.
  'Directory',
  'Authentication',
  // Read from the registry when used, or kept current by cache invalidation.
  'Account',
  'AccountPassword',
  'AccountSettings',
  'ApiKey',
  'AppPassword',
  'Domain',
  'DkimSignature',
  'MailingList',
  'MaskedEmail',
  'OAuthClient',
  'PublicKey',
  'Role',
  'Tenant',
  // Operations, records and telemetry rather than settings.
  'Action',
  'ArchivedItem',
  'ArfExternalReport',
  'Bootstrap',
  'ClusterNode',
  'DmarcExternalReport',
  'DmarcInternalReport',
  'Log',
  'Metric',
  'QueuedMessage',
  'SpamTrainingSample',
  'Task',
  'TlsExternalReport',
  'TlsInternalReport',
  'Trace',
  // Stores are opened once at startup and a reload keeps the ones it has, so
  // saying "applied" would be untrue. They take effect on a restart.
  'BlobStore',
  'Coordinator',
  'DataStore',
  'InMemoryStore',
  'SearchStore',
  // Applications are unpacked by their own manager, which no reload reaches.
  'Application',
]);

/**
 * The action that applies a write to `objectName` (an `x:` registry name), or
 * null when the write needs none. Types this list doesn't know are reloaded:
 * an unneeded reload costs a second, a missing one leaves a setting unapplied.
 */
export function reloadActionFor(objectName: string): ReloadAction | null {
  if (!objectName.startsWith('x:')) return null;
  const type = objectName.slice(2);
  if (NOTHING_TO_APPLY.has(type)) return null;
  return OWN_ACTION[type] ?? 'ReloadSettings';
}

const REGISTRY_SET = /^(x:[A-Za-z0-9]+)\/set$/;

/** Whether a request writes to the registry: any `x:<Type>/set` call. */
export function writesRegistry(methodCalls: JmapMethodCall[]): boolean {
  return methodCalls.some(([name]) => REGISTRY_SET.test(name));
}

/** The registry types a response says were created, changed or destroyed. */
export function writtenRegistryTypes(methodResponses: JmapMethodResponse[]): string[] {
  const types = new Set<string>();
  for (const [name, result] of methodResponses) {
    const match = REGISTRY_SET.exec(name);
    if (!match || !result) continue;
    const created = result.created as Record<string, unknown> | null | undefined;
    const updated = result.updated as Record<string, unknown> | null | undefined;
    const destroyed = result.destroyed as unknown[] | null | undefined;
    if (
      (created && Object.keys(created).length > 0) ||
      (updated && Object.keys(updated).length > 0) ||
      (destroyed && destroyed.length > 0)
    ) {
      types.add(match[1]);
    }
  }
  return [...types];
}

/** The actions due for a set of written types, in the order they run. */
export function reloadActionsFor(objectNames: Iterable<string>): ReloadAction[] {
  const due = new Set<ReloadAction>();
  for (const name of objectNames) {
    const action = reloadActionFor(name);
    if (action) due.add(action);
  }
  return RELOAD_ORDER.filter((a) => due.has(a));
}

export interface ApplyFailure {
  /** What went wrong, in the server's words where it gave any. */
  message: string;
  /** The settings object that didn't build, when the server named one. */
  object?: JmapObjectRef;
}

/** Reads a failed reload action into something to show an administrator. */
export function describeApplyFailure(err: JmapSetError): ApplyFailure {
  let message = err.description?.trim() ?? '';
  if (!message && err.validationErrors && err.validationErrors.length > 0) {
    message = err.validationErrors
      .map((ve) => (ve.property ? `${ve.property}: ${validationErrorMessage(ve)}` : validationErrorMessage(ve)))
      .join('; ');
  }
  if (!message) message = friendlySetError(err);
  const object = typeof err.objectId === 'object' && err.objectId?.object ? err.objectId : undefined;
  return object ? { message, object } : { message };
}

/** A failure that came back as a method error or a failed request rather than a set error. */
export function describeRequestFailure(err: unknown): ApplyFailure {
  if (err instanceof Error && err.message) return { message: err.message };
  if (err && typeof err === 'object') {
    const e = err as { type?: unknown; description?: unknown };
    if (typeof e.description === 'string' && e.description) return { message: e.description };
    if (typeof e.type === 'string' && e.type) {
      return { message: i18n.t('jmapErrors.unexpected', 'Unexpected error ({{type}}).', { type: e.type }) };
    }
  }
  return { message: i18n.t('settingsApply.noAnswer', 'The server did not answer.') };
}
