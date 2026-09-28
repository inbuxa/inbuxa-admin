/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: which Settings pages hold values someone has changed from the
 * default, for the Overview (settings-reorg). It counts exactly what a form
 * marks as changed (FieldWidget): a field whose default can be put into words
 * and whose value differs from it.
 */

import { describeDefault, differsFromDefault } from '@/help/defaults';
import { resolveForm, resolveObject, resolveSchema } from '@/lib/schemaResolver';
import type { LayoutItem, LayoutSubItem, Schema } from '@/types/schema';

const WORDS = { on: 'on', off: 'off', none: 'none' };

export interface SettingsPageRef {
  viewName: string;
  label: string;
  /** Category › group, for the list. */
  where: string;
}

/** The singleton pages in a layout: the only ones with one value set to compare. */
export function singletonPages(schema: Schema, items: LayoutItem[]): SettingsPageRef[] {
  const out: SettingsPageRef[] = [];
  const visit = (subs: LayoutSubItem[], where: string) => {
    for (const sub of subs) {
      if (sub.type === 'container') {
        visit(sub.items, `${where} › ${sub.name}`);
      } else if (resolveObject(schema, sub.viewName)?.objectType.type === 'singleton') {
        out.push({ viewName: sub.viewName, label: sub.name, where });
      }
    }
  };
  for (const item of items) {
    if ('container' in item) visit(item.container.items, item.container.name);
  }
  return out;
}

export interface ChangedField {
  name: string;
  label: string;
  /** The current value in words, or null when there is nothing short to say. */
  now: string | null;
  /** The default in words. */
  was: string;
  defaultValue: unknown;
}

/**
 * The fields on a page that differ from their defaults, given the object's
 * current value: what "Reset to default" puts back. Server-set fields are
 * left out, since nobody can change them.
 */
export function changedFields(
  schema: Schema,
  viewName: string,
  data: Record<string, unknown>,
  words: { on: string; off: string; none: string } = WORDS,
): ChangedField[] {
  const resolved = resolveObject(schema, viewName);
  if (!resolved) return [];
  const sch = resolveSchema(schema, resolved.objectName);
  if (!sch) return [];

  let scope: string;
  let schemaName: string;
  if (sch.type === 'single') {
    scope = resolved.objectName;
    schemaName = sch.schemaName;
  } else {
    const variant = sch.variants.find((v) => v.name === data['@type']);
    if (!variant?.schemaName) return [];
    scope = variant.schemaName;
    schemaName = variant.schemaName;
  }

  const fields = schema.fields[scope] ?? schema.fields[schemaName];
  const form = resolveForm(schema, viewName, resolved.objectName, schemaName);
  if (!fields || !form) return [];

  const out: ChangedField[] = [];
  const seen = new Set<string>();
  for (const section of form.sections) {
    for (const formField of section.fields) {
      const { name } = formField;
      const field = fields.properties[name];
      if (!field || seen.has(name) || field.update === 'serverSet') continue;
      seen.add(name);
      const def = fields.defaults?.[name];
      const was = describeDefault(field, def, schema, words);
      if (was === null || !differsFromDefault(data[name], def)) continue;
      out.push({
        name,
        label: formField.label || name,
        now: describeDefault(field, data[name], schema, words),
        was,
        defaultValue: def,
      });
    }
  }
  return out;
}

/** How many of a page's fields differ from their defaults, given the object's current value. */
export function countChanged(schema: Schema, viewName: string, data: Record<string, unknown>): number {
  return changedFields(schema, viewName, data).length;
}
