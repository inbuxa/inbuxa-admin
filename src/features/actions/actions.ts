/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Server actions (`x:Action`): each variant is an action, run by creating
 * one. These are the page's rules apart from the page.
 */
import { SECRET_MASK } from '@/lib/jmapUtils';
import type { JmapSetError } from '@/types/jmap';
import type { Fields, Form, FormSection, ObjectVariant } from '@/types/schema';

/** The id an action is created under; the answer comes back under it. */
export const CREATE_ID = 'action-0';

/** Labels read "Group: Action"; a label without a group goes under `other`. */
export function splitLabel(label: string, other: string): { group: string; name: string } {
  const colon = label.indexOf(':');
  return colon > 0
    ? { group: label.slice(0, colon).trim(), name: label.slice(colon + 1).trim() }
    : { group: other, name: label };
}

/** The actions the admin may run, by group, in the order the schema lists them. */
export function groupActions(
  variants: ObjectVariant[],
  allowed: (name: string) => boolean,
  other: string,
): Map<string, ObjectVariant[]> {
  const groups = new Map<string, ObjectVariant[]>();
  for (const variant of variants) {
    if (!allowed(variant.name)) continue;
    const { group } = splitLabel(variant.label, other);
    groups.set(group, [...(groups.get(group) ?? []), variant]);
  }
  return groups;
}

/**
 * What creating the action sends: its type, and each option the admin set.
 * Results the server fills in stay out, and so does a secret still showing
 * its mask, which means it wasn't changed.
 */
export function actionPayload(
  type: string,
  fields: Fields | null,
  values: Record<string, unknown>,
): Record<string, unknown> {
  const payload: Record<string, unknown> = { '@type': type };
  for (const [name, def] of Object.entries(fields?.properties ?? {})) {
    if (def.update === 'serverSet' || !(name in values)) continue;
    const secret = def.type.type === 'string' && (def.type.format === 'secret' || def.type.format === 'secretText');
    if (secret && values[name] === SECRET_MASK) continue;
    payload[name] = values[name];
  }
  return payload;
}

export type ActionResult =
  /** What the server sent back besides ids, or null when that was nothing. */
  { kind: 'done'; returned: Record<string, unknown> | null } | { kind: 'refused'; reason: string | null };

const IDS = new Set(['id', 'blobId']);

/** Reads the answer to creating the action. An answer that mentions neither outcome counts as done. */
export function readActionResult(result: Record<string, unknown> | undefined): ActionResult {
  const created = (result?.created as Record<string, Record<string, unknown>> | null | undefined)?.[CREATE_ID];
  const refused = (result?.notCreated as Record<string, JmapSetError> | null | undefined)?.[CREATE_ID];
  if (!created && refused) return { kind: 'refused', reason: refused.description ?? null };
  const returned = Object.fromEntries(Object.entries(created ?? {}).filter(([key]) => !IDS.has(key)));
  return { kind: 'done', returned: Object.keys(returned).length > 0 ? returned : null };
}

/** The form's sections cut down to the options an admin sets; sections of results drop out. */
export function inputSections(fields: Fields, form: Form): FormSection[] {
  return form.sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((ff) => fields.properties[ff.name]?.update === 'mutable'),
    }))
    .filter((section) => section.fields.length > 0);
}

/** Text, numbers, choices and object references must be filled in unless optional. */
const CHECKED = new Set(['string', 'number', 'enum', 'objectId']);

export function missingInputs(
  sections: FormSection[],
  fields: Fields,
  values: Record<string, unknown>,
  required: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const ff of sections.flatMap((s) => s.fields)) {
    const type = fields.properties[ff.name]?.type;
    if (!type || !CHECKED.has(type.type) || ('nullable' in type && type.nullable)) continue;
    const value = values[ff.name];
    if (value === undefined || value === null || value === '') errors[ff.name] = required;
  }
  return errors;
}
