/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { countChanged, singletonPages } from './changedFromDefault';
import type { Schema } from '@/types/schema';

const field = (type: Record<string, unknown>) => ({ description: '', type, update: 'mutable' });

const schema = {
  objects: {
    'x:Imap': { type: 'singleton', permissionPrefix: 'sysImap' },
    'x:Email': { type: 'singleton', permissionPrefix: 'sysEmail' },
    'x:Email/EmailLimits': { type: 'view', objectName: 'x:Email' },
    'x:Tracer': { type: 'object', permissionPrefix: 'sysTracer' },
  },
  schemas: {
    'x:Imap': { type: 'single', schemaName: 'x:Imap' },
    'x:Email': { type: 'single', schemaName: 'x:Email' },
  },
  fields: {
    'x:Imap': {
      properties: {
        allowPlainText: field({ type: 'boolean' }),
        timeout: field({ type: 'number', format: 'duration' }),
        banner: field({ type: 'string' }),
      },
      defaults: { allowPlainText: false, timeout: 1800000 },
    },
    'x:Email': {
      properties: { maxSize: field({ type: 'number', format: 'size' }), defaultFolder: field({ type: 'string' }) },
      defaults: { maxSize: 1000, defaultFolder: 'Inbox' },
    },
  },
  forms: {
    'x:Imap': { sections: [{ fields: [{ name: 'allowPlainText' }, { name: 'timeout' }, { name: 'banner' }] }] },
    'x:Email/EmailLimits': { sections: [{ fields: [{ name: 'maxSize' }] }] },
  },
  enums: {},
  lists: {},
  layouts: [],
} as unknown as Schema;

describe('countChanged', () => {
  it('counts fields that differ from a default it can describe', () => {
    expect(countChanged(schema, 'x:Imap', { allowPlainText: true, timeout: 1800000, banner: 'hi' })).toBe(1);
  });

  it('treats an unset value as the default', () => {
    expect(countChanged(schema, 'x:Imap', {})).toBe(0);
  });

  it('only counts the fields on the view it was asked about', () => {
    // defaultFolder differs too, but it is not on the Limits page.
    expect(countChanged(schema, 'x:Email/EmailLimits', { maxSize: 5, defaultFolder: 'Other' })).toBe(1);
  });
});

describe('singletonPages', () => {
  it('lists singleton pages with where they sit, skipping lists', () => {
    const pages = singletonPages(schema, [
      {
        container: {
          name: 'Mail & apps',
          icon: 'mail',
          items: [
            {
              type: 'container',
              name: 'Protocols',
              items: [
                { type: 'link', name: 'IMAP', viewName: 'x:Imap' },
                { type: 'link', name: 'Tracers', viewName: 'x:Tracer' },
              ],
            },
            { type: 'link', name: 'Limits', viewName: 'x:Email/EmailLimits' },
          ],
        },
      },
    ]);
    expect(pages).toEqual([
      { viewName: 'x:Imap', label: 'IMAP', where: 'Mail & apps › Protocols' },
      { viewName: 'x:Email/EmailLimits', label: 'Limits', where: 'Mail & apps' },
    ]);
  });
});
