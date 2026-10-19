/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';

import { friendlySetError, validationErrorMessage } from './jmapErrors';

describe('validationErrorMessage', () => {
  it('says what the field needs', () => {
    expect(validationErrorMessage({ type: 'Required', property: 'name' })).toBe('This field is required.');
    expect(validationErrorMessage({ type: 'MaxLength', property: 'name', required: 64 })).toBe('Maximum length is 64.');
    expect(validationErrorMessage({ type: 'MinValue', property: 'port', required: 1 })).toBe('Minimum value is 1.');
  });

  it("gives the server's reason for an invalid value, when there is one", () => {
    expect(validationErrorMessage({ type: 'Invalid', property: 'host', value: 'Not a hostname' })).toBe(
      'Not a hostname',
    );
    expect(validationErrorMessage({ type: 'Invalid', property: 'host', value: '' })).toBe('Invalid value.');
    expect(validationErrorMessage({ type: 'Invalid', property: 'host' })).toBe('Invalid value.');
  });
});

describe('friendlySetError', () => {
  it("prefers the server's own description", () => {
    expect(friendlySetError({ type: 'forbidden', description: 'Only tenant admins may do this.' })).toBe(
      'Only tenant admins may do this.',
    );
  });

  it('explains the known error types', () => {
    expect(friendlySetError({ type: 'objectIsLinked' })).toBe(
      'This item is referenced by other items and cannot be deleted.',
    );
    expect(friendlySetError({ type: 'singleton' })).toBe('This item is a singleton and cannot be deleted.');
  });

  it('names a type it does not know, including ones that look like object keys', () => {
    expect(friendlySetError({ type: 'somethingNew' })).toBe('Unexpected error (somethingNew).');
    expect(friendlySetError({ type: 'toString' })).toBe('Unexpected error (toString).');
  });
});
