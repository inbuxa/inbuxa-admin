/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it, vi } from 'vitest';
import type { Schema } from '@/types/schema';

// The served schema goes through the settings regrouping and extra columns first; here it passes as is.
vi.mock('@/lib/settingsLayout', () => ({ withRegroupedSettings: (s: Schema) => s }));
vi.mock('@/lib/listColumns', () => ({ withExtraColumns: (s: Schema) => s }));

const { useSchemaStore } = await import('./schemaStore');

const schema = {
  objects: {
    'x:Domain': { type: 'object', description: 'Mail domains', permissionPrefix: 'sysDomain' },
    'x:Smtp': { type: 'singleton', description: 'SMTP server', permissionPrefix: 'sysSmtp' },
    'x:Thing': { type: 'object', description: 'Things', permissionPrefix: 'sysThing' },
    'x:Quiet': { type: 'object', description: '', permissionPrefix: 'sysQuiet' },
    'x:SmtpView': { type: 'view', objectName: 'x:Smtp' },
  },
  forms: {
    'x:SmtpView': {
      sections: [
        { title: 'Greeting', fields: [{ name: 'banner', label: 'Banner' }] },
        { fields: [{ name: '@type', label: 'Kind' }] },
      ],
    },
    'x:Smtp': { title: 'SMTP', sections: [] },
  },
  lists: { 'x:Domain': { singularName: 'domain' } },
  layouts: [
    {
      name: 'Mail',
      icon: 'mail',
      items: [
        { link: { name: 'Domains', icon: 'globe', viewName: 'x:Domain' } },
        {
          container: {
            name: 'Delivery',
            icon: 'send',
            items: [
              { type: 'link', name: 'SMTP', viewName: 'x:SmtpView' },
              { type: 'container', name: 'More', items: [{ type: 'link', name: 'Things', viewName: 'x:Thing' }] },
            ],
          },
        },
      ],
    },
    { name: 'Other', icon: 'x', items: [{ link: { name: 'Domains again', icon: 'globe', viewName: 'x:Domain' } }] },
  ],
} as unknown as Schema;

useSchemaStore.getState().setSchema(schema);
const { viewToSection, searchIndex, isLoaded } = useSchemaStore.getState();

describe('schemaStore', () => {
  it('is loaded once a schema is set', () => {
    expect(isLoaded).toBe(true);
    expect(useSchemaStore.getState().schema).toBe(schema);
  });

  it('puts each linked view in the first section that links it', () => {
    expect(viewToSection).toEqual({ 'x:Domain': 'Mail', 'x:SmtpView': 'Mail', 'x:Thing': 'Mail' });
  });

  it('indexes every link with its path, top-level ones with their icon', () => {
    expect(searchIndex.filter((e) => e.type === 'link' && !e.objectType)).toEqual([
      {
        text: 'Domains',
        type: 'link',
        viewName: 'x:Domain',
        section: 'Mail',
        breadcrumb: 'Mail > Domains',
        icon: 'globe',
      },
      { text: 'SMTP', type: 'link', viewName: 'x:SmtpView', section: 'Mail', breadcrumb: 'Mail > Delivery > SMTP' },
      {
        text: 'Things',
        type: 'link',
        viewName: 'x:Thing',
        section: 'Mail',
        breadcrumb: 'Mail > Delivery > More > Things',
      },
      {
        text: 'Domains again',
        type: 'link',
        viewName: 'x:Domain',
        section: 'Other',
        breadcrumb: 'Other > Domains again',
        icon: 'globe',
      },
    ]);
  });

  it('indexes object descriptions under the name a reader knows them by', () => {
    expect(searchIndex.filter((e) => e.objectType)).toEqual([
      {
        text: 'Mail domains',
        type: 'link',
        viewName: 'x:Domain',
        section: 'Mail',
        breadcrumb: 'Mail > Domain',
        objectType: 'object',
      },
      {
        text: 'SMTP server',
        type: 'link',
        viewName: 'x:Smtp',
        section: '',
        breadcrumb: 'SMTP',
        objectType: 'singleton',
      },
      {
        text: 'Things',
        type: 'link',
        viewName: 'x:Thing',
        section: 'Mail',
        breadcrumb: 'Mail > Thing',
        objectType: 'object',
      },
    ]);
  });

  it('indexes form sections and fields, with the field name as a keyword', () => {
    expect(searchIndex.filter((e) => e.type !== 'link')).toEqual([
      {
        text: 'Greeting',
        type: 'form',
        viewName: 'x:SmtpView',
        section: 'Mail',
        breadcrumb: 'Mail > SmtpView > Greeting',
      },
      {
        text: 'Banner',
        type: 'field',
        viewName: 'x:SmtpView',
        section: 'Mail',
        breadcrumb: 'Mail > SmtpView > Banner',
        keywords: ['banner'],
      },
      {
        text: 'Kind',
        type: 'field',
        viewName: 'x:SmtpView',
        section: 'Mail',
        breadcrumb: 'Mail > SmtpView > Kind',
        keywords: [],
      },
    ]);
  });

  it('lists links first, then descriptions, then forms', () => {
    const kinds = searchIndex.map((e) => (e.objectType ? 'description' : e.type));
    expect(kinds).toEqual([
      'link',
      'link',
      'link',
      'link',
      'description',
      'description',
      'description',
      'form',
      'field',
      'field',
    ]);
  });
});
