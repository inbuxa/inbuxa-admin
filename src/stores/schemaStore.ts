/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { create } from 'zustand';
import { withExtraColumns } from '@/lib/listColumns';
import { withRegroupedSettings } from '@/lib/settingsLayout';
import type { LayoutSubItem, Schema } from '@/types/schema';

/** Something global search can find: a page, a form section or a field. */
export interface SearchIndexEntry {
  text: string;
  type: 'link' | 'field' | 'form';
  viewName: string;
  section: string;
  breadcrumb: string;
  icon?: string;
  objectType?: 'object' | 'singleton' | 'view';
  keywords?: string[];
}

interface SchemaState {
  schema: Schema | null;
  isLoaded: boolean;
  /** The layout (top-level section) each view is linked from; the first one, when several link it. */
  viewToSection: Record<string, string>;
  searchIndex: SearchIndexEntry[];

  setSchema: (schema: Schema) => void;
}

/** Every link in the layouts, with the path of names that leads to it. */
function indexLinks(schema: Schema) {
  const viewToSection: Record<string, string> = {};
  const links: SearchIndexEntry[] = [];
  const add = (section: string, path: string, name: string, viewName: string, icon?: string) => {
    viewToSection[viewName] ??= section;
    links.push({
      text: name,
      type: 'link',
      viewName,
      section,
      breadcrumb: `${path} > ${name}`,
      ...(icon !== undefined && { icon }),
    });
  };
  const walk = (section: string, path: string, items: LayoutSubItem[]) => {
    for (const item of items) {
      if (item.type === 'link') add(section, path, item.name, item.viewName);
      else if (item.type === 'container') walk(section, `${path} > ${item.name}`, item.items);
    }
  };
  for (const { name: section, items } of schema.layouts) {
    for (const item of items) {
      if ('link' in item) add(section, section, item.link.name, item.link.viewName, item.link.icon);
      else if ('container' in item) walk(section, `${section} > ${item.container.name}`, item.container.items);
    }
  }
  return { viewToSection, links };
}

/**
 * The name a view goes by in a breadcrumb: a singleton's form title, an
 * object's singular name, or else its type without `x:`. A view of another
 * object is named after that object, unless its own form or list says more.
 */
function viewTitle(schema: Schema, viewName: string): string {
  const fallback = viewName.replace(/^x:/, '');
  const entry = schema.objects[viewName];
  if (!entry) return fallback;
  const shown = entry.type === 'view' ? schema.objects[entry.objectName] : entry;
  const named = entry.type === 'view' && shown && shown.type !== 'view' ? entry.objectName : viewName;
  const kind = shown && shown.type !== 'view' ? shown.type : entry.type;
  if (kind === 'singleton') {
    const title = (schema.forms[viewName] ?? schema.forms[named])?.title;
    if (title) return title;
  } else if (kind === 'object') {
    const singular = (schema.lists[viewName] ?? schema.lists[named])?.singularName;
    if (singular) return singular[0].toUpperCase() + singular.slice(1);
  }
  return fallback;
}

/** Links first, then each object's description, then every form section and field. */
function buildIndex(schema: Schema) {
  const { viewToSection, links } = indexLinks(schema);
  const searchIndex = [...links];
  const under = (section: string, ...names: string[]) => [...(section ? [section] : []), ...names].join(' > ');

  for (const [viewName, entry] of Object.entries(schema.objects)) {
    if (entry.type === 'view' || !entry.description) continue;
    const section = viewToSection[viewName] ?? '';
    searchIndex.push({
      text: entry.description,
      type: 'link',
      viewName,
      section,
      breadcrumb: under(section, viewTitle(schema, viewName)),
      objectType: entry.type,
    });
  }

  for (const [viewName, form] of Object.entries(schema.forms)) {
    const section = viewToSection[viewName] ?? '';
    const title = viewTitle(schema, viewName);
    for (const formSection of form.sections) {
      if (formSection.title) {
        searchIndex.push({
          text: formSection.title,
          type: 'form',
          viewName,
          section,
          breadcrumb: under(section, title, formSection.title),
        });
      }
      for (const field of formSection.fields) {
        searchIndex.push({
          text: field.label,
          type: 'field',
          viewName,
          section,
          breadcrumb: under(section, title, field.label),
          // Search by the property name too, except the variant switch.
          keywords: field.name && field.name !== '@type' ? [field.name] : [],
        });
      }
    }
  }
  return { viewToSection, searchIndex };
}

export const useSchemaStore = create<SchemaState>()((set) => ({
  schema: null,
  isLoaded: false,
  viewToSection: {},
  searchIndex: [],

  setSchema: (served) => {
    // Settings grouped by task rather than by config file, plus the list columns the server leaves out.
    const schema = withExtraColumns(withRegroupedSettings(served));
    set({ schema, isLoaded: true, ...buildIndex(schema) });
  },
}));
