/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Console logging for development builds, switched on in `.env.local`:
 *
 *   VITE_DEBUG_JMAP=1    every JMAP request and its responses
 *   VITE_DEBUG_FORMS=1   every form change, as the data that would be saved
 *
 * Production builds never log, whatever the variables say.
 */

/** Whether a debug variable turns logging on: set, and not "0" or "false". */
export function flagOn(value: string | undefined, dev = import.meta.env.DEV): boolean {
  return dev && !!value && !['0', 'false'].includes(value.toLowerCase());
}

export const debugJmap = flagOn(import.meta.env.VITE_DEBUG_JMAP);
export const debugForms = flagOn(import.meta.env.VITE_DEBUG_FORMS);

const count = (v: unknown) => (Array.isArray(v) ? v.length : v && typeof v === 'object' ? Object.keys(v).length : 0);

/** One row per method call or response: what it is and how much it touches. */
export function describeInvocations(invocations: unknown): Record<string, string | number>[] {
  if (!Array.isArray(invocations)) return [];
  return invocations.map((inv) => {
    const [name, args, callId] = Array.isArray(inv) ? inv : [];
    const a: Record<string, unknown> = args && typeof args === 'object' ? args : {};
    const row: Record<string, string | number> = { method: String(name ?? '?'), callId: String(callId ?? '?') };
    if (a.ids === null) row.ids = 'all';
    else if (Array.isArray(a.ids)) row.ids = a.ids.length;
    for (const key of [
      'create',
      'update',
      'destroy',
      'list',
      'created',
      'updated',
      'destroyed',
      'notCreated',
      'notUpdated',
      'notDestroyed',
    ]) {
      if (a[key] != null && count(a[key])) row[key] = count(a[key]);
    }
    if (typeof a.total === 'number') row.total = a.total;
    if (name === 'error' && typeof a.type === 'string') row.error = a.type;
    return row;
  });
}

export function logJmapExchange(methodCalls: unknown, methodResponses: unknown, durationMs?: number): void {
  if (!debugJmap) return;
  const responses = describeInvocations(methodResponses);
  const failed = responses.some((r) => r.method === 'error');
  const names = describeInvocations(methodCalls)
    .map((r) => r.method)
    .join(', ');
  const took = durationMs === undefined ? '' : ` ${Math.round(durationMs)} ms`;
  console.groupCollapsed(
    `%cJMAP%c ${names}${took}${failed ? ' — error' : ''}`,
    `color:${failed ? '#dc2626' : '#0d9488'};font-weight:600`,
    '',
  );
  console.table(describeInvocations(methodCalls));
  console.table(responses);
  console.debug('request', methodCalls);
  console.debug('responses', methodResponses);
  console.groupEnd();
}

export function logFormChange(label: string, data: unknown): void {
  if (!debugForms) return;
  console.groupCollapsed(`%cForm%c ${label}`, 'color:#7c3aed;font-weight:600', '');
  console.debug(data);
  console.groupEnd();
}
