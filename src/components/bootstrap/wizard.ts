/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The setup wizard's rules, apart from the page: its pages, what each requires, and what the server answers. */
import type { JmapSetError, ValidationError } from '@/types/jmap';
import type { Field, Fields, Form, FormField } from '@/types/schema';

export interface WizardField {
  formField: FormField;
  field: Field;
}

export interface WizardPage {
  title?: string;
  fields: WizardField[];
}

/** Field errors by field name, and the first page that has one (null when none does). */
export interface PageErrors {
  errors: Record<string, string>;
  page: number | null;
}

/**
 * One page per form section, with the fields an admin fills in: not ones
 * the server sets, nor Enterprise ones. A section left with none is skipped.
 */
export function wizardPages(fields: Fields, form: Form | null): WizardPage[] {
  if (!form) return [];
  return form.sections
    .map((section) => ({
      title: section.title,
      fields: section.fields.flatMap((formField) => {
        const field = fields.properties[formField.name];
        return field && field.update !== 'serverSet' && !field.enterprise ? [{ formField, field }] : [];
      }),
    }))
    .filter((page) => page.fields.length > 0);
}

/** Plain values can be checked for presence here; objects, lists and maps check themselves. */
const PLAIN = new Set(['string', 'number', 'utcDateTime', 'enum', 'blobId', 'objectId']);

/** The page's required fields that are still empty. */
export function missingOnPage(
  page: WizardPage,
  data: Record<string, unknown>,
  required: string,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const { formField, field } of page.fields) {
    if (field.update !== 'mutable' || !PLAIN.has(field.type.type)) continue;
    if ('nullable' in field.type && field.type.nullable) continue;
    const value = data[formField.name];
    if (value === undefined || value === null || value === '') errors[formField.name] = required;
  }
  return errors;
}

/** Every required field still empty, on any page. */
export function firstMissing(pages: WizardPage[], data: Record<string, unknown>, required: string): PageErrors {
  const result: PageErrors = { errors: {}, page: null };
  pages.forEach((page, index) => {
    const missing = missingOnPage(page, data, required);
    if (Object.keys(missing).length === 0) return;
    Object.assign(result.errors, missing);
    result.page ??= index;
  });
  return result;
}

/**
 * The server's refusal, on the fields it names. A property path like
 * `dataStore/path` belongs to the top-level field `dataStore`; fields
 * the wizard doesn't show are left to the general message.
 */
export function refusalByField(
  error: JmapSetError,
  pages: WizardPage[],
  messages: { invalid: string; validation: (ve: ValidationError) => string },
): PageErrors {
  const pageOf = new Map<string, number>();
  pages.forEach((page, index) => {
    for (const { formField } of page.fields) if (!pageOf.has(formField.name)) pageOf.set(formField.name, index);
  });

  const result: PageErrors = { errors: {}, page: null };
  const mark = (path: string | undefined, message: string) => {
    const name = path?.split('/')[0];
    const page = name ? pageOf.get(name) : undefined;
    if (!name || page === undefined) return;
    result.errors[name] = message;
    if (result.page === null || page < result.page) result.page = page;
  };
  for (const path of error.properties ?? []) mark(path, error.description ?? messages.invalid);
  for (const ve of error.validationErrors ?? []) mark(ve.property, messages.validation(ve));
  return result;
}

export type SetOutcome =
  | { kind: 'updated'; extras: Record<string, unknown> }
  | { kind: 'refused'; error: JmapSetError }
  | { kind: 'unconfirmed' };

/** What `x:Bootstrap/set` said about the singleton: done (with anything it generated), refused, or nothing. */
export function readSetResult(result: Record<string, unknown> | undefined): SetOutcome {
  const updated = result?.updated as Record<string, Record<string, unknown> | null> | null | undefined;
  const notUpdated = result?.notUpdated as Record<string, JmapSetError> | null | undefined;
  if (updated && 'singleton' in updated) return { kind: 'updated', extras: updated.singleton ?? {} };
  if (notUpdated?.singleton) return { kind: 'refused', error: notUpdated.singleton };
  return { kind: 'unconfirmed' };
}

const NOT_SHOWN = new Set(['id', 'blobId', '@type']);

/** What setup generated and the admin must write down, such as the first account's password. */
export function credentials(extras: Record<string, unknown>): [string, string][] {
  return Object.entries(extras).filter(
    (entry): entry is [string, string] => !NOT_SHOWN.has(entry[0]) && typeof entry[1] === 'string' && entry[1] !== '',
  );
}

/** A field's name for people: its form label, else its description's first line, else the name itself. */
export function fieldLabels(form: Form | null, fields: Fields): (name: string) => string {
  const labels = new Map<string, string>();
  for (const section of form?.sections ?? []) for (const ff of section.fields) labels.set(ff.name, ff.label);
  return (name) => labels.get(name) ?? fields.properties[name]?.description?.split('\n')[0] ?? name;
}
