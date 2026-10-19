/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Field, Fields, Form, ObjectVariant } from '@/types/schema';
import { actionPayload, groupActions, inputSections, missingInputs, readActionResult, splitLabel } from './actions';

const variants: ObjectVariant[] = [
  { name: 'ReloadSettings', label: 'Reload: Server settings' },
  { name: 'ReloadTls', label: 'Reload: TLS certificates' },
  { name: 'ClassifySpam', label: 'Spam Filter: Classify a message', schemaName: 'x:SpamClassify' },
  { name: 'Odd', label: ':starts with a colon' },
  { name: 'Plain', label: 'No group' },
  { name: 'Hidden', label: 'Reload: Hidden' },
];

describe('splitLabel', () => {
  it('splits "Group: Action" at the first colon', () => {
    expect(splitLabel('Reload: Server settings', 'Other')).toEqual({ group: 'Reload', name: 'Server settings' });
    expect(splitLabel('A: b: c', 'Other')).toEqual({ group: 'A', name: 'b: c' });
    expect(splitLabel('No group', 'Other')).toEqual({ group: 'Other', name: 'No group' });
    expect(splitLabel(':x', 'Other')).toEqual({ group: 'Other', name: ':x' });
  });
});

describe('groupActions', () => {
  it('groups the allowed actions in schema order', () => {
    const groups = groupActions(variants, (name) => name !== 'Hidden', 'Other');
    expect([...groups].map(([g, list]) => [g, list.map((v) => v.name)])).toEqual([
      ['Reload', ['ReloadSettings', 'ReloadTls']],
      ['Spam Filter', ['ClassifySpam']],
      ['Other', ['Odd', 'Plain']],
    ]);
  });
});

const field = (type: Record<string, unknown>, update: Field['update'] = 'mutable') =>
  ({ description: '', type, update }) as unknown as Field;

const fields: Fields = {
  properties: {
    message: field({ type: 'string', format: 'text' }),
    password: field({ type: 'string', format: 'secret' }),
    note: field({ type: 'string', format: 'secretText' }),
    ip: field({ type: 'string', format: 'ipAddress' }),
    optional: field({ type: 'string', nullable: true }),
    count: field({ type: 'number' }),
    level: field({ type: 'enum' }),
    tls: field({ type: 'boolean' }),
    when: field({ type: 'utcDateTime' }),
    score: field({ type: 'number' }, 'serverSet'),
    fixed: field({ type: 'string' }, 'immutable'),
  },
};

describe('actionPayload', () => {
  it('sends the action type and the inputs the admin set, not server results or unchanged secrets', () => {
    expect(
      actionPayload('ClassifySpam', fields, {
        message: 'raw',
        password: '****',
        note: 'new secret',
        score: 5,
        tls: false,
        extra: 'not in schema',
      }),
    ).toEqual({ '@type': 'ClassifySpam', message: 'raw', note: 'new secret', tls: false });
  });

  it('is only the type for an action without options', () => {
    expect(actionPayload('ReloadSettings', null, { anything: 1 })).toEqual({ '@type': 'ReloadSettings' });
  });
});

describe('readActionResult', () => {
  it('returns what the server added, without ids', () => {
    expect(readActionResult({ created: { 'action-0': { id: 'x', blobId: 'b', score: 3, result: 'ham' } } })).toEqual({
      kind: 'done',
      returned: { score: 3, result: 'ham' },
    });
    expect(readActionResult({ created: { 'action-0': { id: 'x' } } })).toEqual({ kind: 'done', returned: null });
  });

  it("returns the server's reason for a refusal, if it gave one", () => {
    expect(readActionResult({ notCreated: { 'action-0': { type: 'forbidden', description: 'Busy' } } })).toEqual({
      kind: 'refused',
      reason: 'Busy',
    });
    expect(readActionResult({ notCreated: { 'action-0': { type: 'forbidden' } } })).toEqual({
      kind: 'refused',
      reason: null,
    });
  });

  it('counts an answer about neither as done', () => {
    expect(readActionResult({})).toEqual({ kind: 'done', returned: null });
    expect(readActionResult(undefined)).toEqual({ kind: 'done', returned: null });
  });
});

describe('the options form', () => {
  const form: Form = {
    sections: [
      {
        title: 'Input',
        fields: [
          { name: 'message', label: 'Message' },
          { name: 'optional', label: 'Optional' },
          { name: 'count', label: 'Count' },
          { name: 'level', label: 'Level' },
          { name: 'tls', label: 'TLS' },
          { name: 'when', label: 'When' },
          { name: 'ghost', label: 'Not in the schema' },
        ],
      },
      {
        title: 'Results',
        fields: [
          { name: 'score', label: 'Score' },
          { name: 'fixed', label: 'Fixed' },
        ],
      },
    ],
  };
  const sections = inputSections(fields, form);

  it('shows only the inputs, dropping sections of results', () => {
    expect(sections.map((s) => [s.title, s.fields.map((f) => f.name)])).toEqual([
      ['Input', ['message', 'optional', 'count', 'level', 'tls', 'when']],
    ]);
  });

  it('requires text, numbers and choices that are not optional', () => {
    expect(missingInputs(sections, fields, { message: '', count: null, tls: undefined }, 'Required')).toEqual({
      message: 'Required',
      count: 'Required',
      level: 'Required',
    });
    expect(missingInputs(sections, fields, { message: 'm', count: 0, level: 'x' }, 'Required')).toEqual({});
  });
});
