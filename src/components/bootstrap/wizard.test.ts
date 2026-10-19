/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Field, Fields, Form } from '@/types/schema';
import {
  credentials,
  fieldLabels,
  firstMissing,
  missingOnPage,
  readSetResult,
  refusalByField,
  wizardPages,
} from './wizard';

const field = (type: Record<string, unknown>, more: Partial<Field> = {}) =>
  ({ description: 'Desc line\nmore', type, update: 'mutable', ...more }) as Field;

const fields: Fields = {
  properties: {
    host: field({ type: 'string' }),
    domain: field({ type: 'string' }),
    note: field({ type: 'string', nullable: true }),
    tls: field({ type: 'boolean' }),
    id: field({ type: 'string' }, { update: 'serverSet' }),
    paid: field({ type: 'string' }, { enterprise: true }),
    store: field({ type: 'object' }),
    kind: field({ type: 'enum' }),
    fixed: field({ type: 'string' }, { update: 'immutable' }),
  },
};

const form: Form = {
  sections: [
    {
      title: 'Identity',
      fields: [
        { name: 'host', label: 'Hostname' },
        { name: 'domain', label: 'Domain' },
        { name: 'note', label: 'Note' },
        { name: 'tls', label: 'TLS' },
        { name: 'ghost', label: 'Not in the schema' },
      ],
    },
    {
      title: 'Server only',
      fields: [
        { name: 'id', label: 'Id' },
        { name: 'paid', label: 'Paid' },
      ],
    },
    {
      fields: [
        { name: 'store', label: 'Store' },
        { name: 'kind', label: 'Kind' },
        { name: 'fixed', label: 'Fixed' },
      ],
    },
  ],
};

const pages = wizardPages(fields, form);

describe('wizardPages', () => {
  it('keeps the fields an admin fills in, and drops pages left empty', () => {
    expect(pages.map((p) => [p.title, p.fields.map((f) => f.formField.name)])).toEqual([
      ['Identity', ['host', 'domain', 'note', 'tls']],
      [undefined, ['store', 'kind', 'fixed']],
    ]);
    expect(pages[0].fields[0].field).toBe(fields.properties.host);
  });

  it('has no pages without a form', () => {
    expect(wizardPages(fields, null)).toEqual([]);
  });
});

describe('required fields', () => {
  it('asks for plain values that are empty and not optional', () => {
    expect(missingOnPage(pages[0], { host: '', note: '', tls: undefined }, 'Required')).toEqual({
      host: 'Required',
      domain: 'Required',
    });
    expect(missingOnPage(pages[0], { host: 'mail.a.org', domain: 'a.org' }, 'Required')).toEqual({});
  });

  it('leaves objects and fields that cannot change to their own checks', () => {
    expect(missingOnPage(pages[1], { store: null, kind: null, fixed: null }, 'Required')).toEqual({ kind: 'Required' });
  });

  it('finds every missing field and the first page with one', () => {
    expect(firstMissing(pages, { host: 'h', domain: 'd' }, 'Required')).toEqual({
      errors: { kind: 'Required' },
      page: 1,
    });
    expect(firstMissing(pages, { kind: 'x' }, 'Required')).toEqual({
      errors: { host: 'Required', domain: 'Required' },
      page: 0,
    });
    expect(firstMissing(pages, { host: 'h', domain: 'd', kind: 'x' }, 'Required')).toEqual({ errors: {}, page: null });
  });
});

describe('refusalByField', () => {
  const messages = { invalid: 'Invalid value.', validation: (ve: { type: string }) => `bad ${ve.type}` };

  it('puts the server’s reasons on the fields they name, by their top-level name', () => {
    expect(
      refusalByField(
        {
          type: 'invalidProperties',
          description: 'Nope',
          properties: ['kind/value', 'unknown'],
          validationErrors: [{ type: 'MaxLength', property: 'domain', required: 3 }],
        },
        pages,
        messages,
      ),
    ).toEqual({ errors: { kind: 'Nope', domain: 'bad MaxLength' }, page: 0 });
  });

  it('uses a plain message when the server gives none, and names no page when no field is shown', () => {
    expect(refusalByField({ type: 'invalidProperties', properties: ['store'] }, pages, messages)).toEqual({
      errors: { store: 'Invalid value.' },
      page: 1,
    });
    expect(refusalByField({ type: 'forbidden', properties: ['id'] }, pages, messages)).toEqual({
      errors: {},
      page: null,
    });
  });
});

describe('readSetResult', () => {
  it('reads an update, a refusal, or neither', () => {
    expect(readSetResult({ updated: { singleton: { adminPassword: 'x' } } })).toEqual({
      kind: 'updated',
      extras: { adminPassword: 'x' },
    });
    expect(readSetResult({ updated: { singleton: null } })).toEqual({ kind: 'updated', extras: {} });
    expect(readSetResult({ notUpdated: { singleton: { type: 'forbidden' } } })).toEqual({
      kind: 'refused',
      error: { type: 'forbidden' },
    });
    expect(readSetResult({ updated: null, notUpdated: null })).toEqual({ kind: 'unconfirmed' });
    expect(readSetResult(undefined)).toEqual({ kind: 'unconfirmed' });
  });
});

describe('the finish screen', () => {
  it('shows the values the server generated, not ids or empty ones', () => {
    expect(
      credentials({ id: 's', blobId: 'b', '@type': 'X', adminUser: 'admin', empty: '', count: 3, pass: 'p' }),
    ).toEqual([
      ['adminUser', 'admin'],
      ['pass', 'p'],
    ]);
  });

  it('labels a value by its form label, else the first line of its description, else its name', () => {
    const labels = fieldLabels(form, fields);
    expect(labels('host')).toBe('Hostname');
    expect(labels('id')).toBe('Id');
    expect(fieldLabels(null, fields)('host')).toBe('Desc line');
    expect(labels('adminPassword')).toBe('adminPassword');
  });
});
