/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the field inside an embedded object that a refused property
 * belongs to. The server names a property of an embedded object by its own
 * name alone (a domain's `subjectAlternativeNames` lives in its
 * `certificateManagement`), so a name that isn't one of the form's fields
 * is looked for in the objects the form holds. Null when no object has it.
 */
export function embeddedErrorHome(
  property: string,
  topLevel: Record<string, unknown>,
  data: Record<string, unknown>,
): { field: string; child: string } | null {
  if (property.includes('/') || Object.hasOwn(topLevel, property)) return null;
  for (const [field, value] of Object.entries(data)) {
    if (!Object.hasOwn(topLevel, field)) continue;
    if (value && typeof value === 'object' && !Array.isArray(value) && Object.hasOwn(value, property)) {
      return { field, child: property };
    }
  }
  return null;
}

/** The refusals kept for one embedded object's fields (`field/child`), by child name; undefined when none. */
export function childErrorsOf(errors: Record<string, string>, field: string): Record<string, string> | undefined {
  const prefix = `${field}/`;
  let found: Record<string, string> | undefined;
  for (const [key, message] of Object.entries(errors)) {
    if (!key.startsWith(prefix)) continue;
    (found ??= {})[key.slice(prefix.length)] = message;
  }
  return found;
}
