/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the Sieve playground runs a script under the limits and
 * extensions the server gives that kind of script, read live from
 * x:SieveUserInterpreter or x:SieveSystemInterpreter, so a script that
 * breaks a limit fails in the playground as it would on delivery. The
 * mapping follows inbuxa-server's crates/common/src/config/mailstore/
 * scripts.rs; what it sets in code rather than from the settings is
 * repeated here.
 */

import { getAccountId, jmapGet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';

export type SieveInterpreter = 'user' | 'system';

/** Which interpreter runs a script field's object. */
export function interpreterFor(objectName: string): SieveInterpreter {
  return objectName === 'x:SieveSystemScript' ? 'system' : 'user';
}

const OBJECT: Record<SieveInterpreter, string> = {
  user: 'x:SieveUserInterpreter',
  system: 'x:SieveSystemInterpreter',
};

// sieve-rs's usize::MAX as the playground clamps it: the server lifts the
// interpreter's own Received limit for account scripts and checks it while
// delivering instead.
const UNLIMITED = 4294967295;

// What the server switches off for system scripts, which run before
// delivery and have no mailbox to act on.
const SYSTEM_DISABLED = [
  'fileinto',
  'vacation',
  'vacation-seconds',
  'fcc',
  'mailbox',
  'mailboxid',
  'mboxmetadata',
  'servermetadata',
  'imapsieve',
  'duplicate',
];

type Settings = Record<string, unknown>;

/** A JMAP set (an object keyed by value) or a plain list, as strings. */
function members(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .filter(([, present]) => present)
      .map(([key]) => key);
  }
  return [];
}

/** Copies the numbers that are set, under the playground's names. */
function numbers(from: Settings, names: Record<string, string>, to: Settings) {
  for (const [server, playground] of Object.entries(names)) {
    const value = from[server];
    if (typeof value === 'number' && Number.isFinite(value)) to[playground] = value;
  }
}

function seconds(ms: unknown): number | undefined {
  return typeof ms === 'number' && Number.isFinite(ms) ? Math.round(ms / 1000) : undefined;
}

/**
 * The playground settings for a script run by `interpreter`, from that
 * interpreter's live settings and every Sieve capability the server knows.
 */
export function playgroundSettings(interpreter: SieveInterpreter, live: Settings, capabilities: string[]): Settings {
  const settings: Settings = {};
  if (interpreter === 'user') {
    const disabled = new Set([...members(live.disableCapabilities), 'vnd.inbuxa.while']);
    settings.capabilities = capabilities.filter((name) => !disabled.has(name));
    numbers(
      live,
      {
        maxCpuCycles: 'cpuLimit',
        maxHeaderSize: 'maxHeaderSize',
        maxIncludes: 'maxIncludes',
        maxLocalVars: 'maxLocalVariables',
        maxMatchVars: 'maxMatchVariables',
        maxNestedBlocks: 'maxNestedBlocks',
        maxNestedForEvery: 'maxNestedForeverypart',
        maxNestedIncludes: 'maxNestedIncludes',
        maxNestedTests: 'maxNestedTests',
        maxOutMessages: 'maxOutMessages',
        maxRedirects: 'maxRedirects',
        maxScriptSize: 'maxScriptSize',
        maxStringLength: 'maxStringSize',
        maxVarNameLength: 'maxVariableNameSize',
        maxVarSize: 'maxVariableSize',
      },
      settings,
    );
    settings.maxReceivedHeaders = UNLIMITED;
    if (live.protectedHeaders !== undefined) settings.protectedHeaders = members(live.protectedHeaders);
    if (live.allowedNotifyUris !== undefined) settings.validNotificationUris = members(live.allowedNotifyUris);
    if (typeof live.defaultSubject === 'string') settings.vacationDefaultSubject = live.defaultSubject;
    if (typeof live.defaultSubjectPrefix === 'string') settings.vacationSubjectPrefix = live.defaultSubjectPrefix;
    const vacation = seconds(live.defaultExpiryVacation);
    if (vacation !== undefined) settings.defaultVacationExpiry = vacation;
    const duplicate = seconds(live.defaultExpiryDuplicate);
    if (duplicate !== undefined) settings.defaultDuplicateExpiry = duplicate;
    return settings;
  }

  const disabled = new Set(SYSTEM_DISABLED);
  settings.capabilities = capabilities.filter((name) => !disabled.has(name));
  if (typeof live.noCapabilityCheck === 'boolean') settings.noCapabilityCheck = live.noCapabilityCheck;
  // The system compiler's fixed limits, and sieve-rs's defaults for the
  // ones the server leaves alone.
  Object.assign(settings, {
    maxScriptSize: 1024 * 1024,
    maxStringSize: 52428800,
    maxVariableNameSize: 100,
    maxNestedBlocks: 50,
    maxNestedTests: 50,
    maxNestedForeverypart: 10,
    maxMatchVariables: 30,
    maxLocalVariables: 8192,
    maxHeaderSize: 10240,
    maxIncludes: 10,
    validNotificationUris: ['mailto'],
    protectedHeaders: ['Original-Subject', 'Original-From'],
  });
  numbers(
    live,
    {
      maxCpuCycles: 'cpuLimit',
      maxNestedIncludes: 'maxNestedIncludes',
      maxOutMessages: 'maxOutMessages',
      maxReceivedHeaders: 'maxReceivedHeaders',
      maxRedirects: 'maxRedirects',
      maxVarSize: 'maxVariableSize',
    },
    settings,
  );
  const duplicate = seconds(live.duplicateExpiry);
  if (duplicate !== undefined) settings.defaultDuplicateExpiry = duplicate;
  return settings;
}

/**
 * Reads the interpreter's settings from the server. Empty, so the
 * playground keeps its own defaults, when they can't be read (the
 * administrator may not be allowed to see them).
 */
export async function fetchPlaygroundSettings(interpreter: SieveInterpreter): Promise<Settings> {
  const capabilities = (useSchemaStore.getState().schema?.enums?.SieveCapability ?? []).map((variant) => variant.name);
  if (capabilities.length === 0) return {};
  try {
    const object = OBJECT[interpreter];
    const [response] = await jmapGet(object, getAccountId(object), ['singleton']);
    const live = ((response?.[1] as { list?: Settings[] } | undefined)?.list ?? [])[0];
    return live ? playgroundSettings(interpreter, live, capabilities) : {};
  } catch {
    return {};
  }
}
