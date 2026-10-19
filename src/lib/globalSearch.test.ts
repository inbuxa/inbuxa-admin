/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { List, Plus, Settings } from 'lucide-react';
import {
  MAX_RESULTS,
  entryPath,
  friendlyName,
  getActionInfo,
  getObjectKind,
  groupByType,
  searchEntries,
} from './globalSearch';
import type { SearchIndexEntry } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

const schema = {
  objects: {
    'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
    'x:Account': { type: 'object', description: '', permissionPrefix: 'sysAccount' },
    'x:Account/User': { type: 'view', objectName: 'x:Account' },
    'x:Security': { type: 'singleton', description: '', permissionPrefix: 'sysSecurity' },
  },
} as unknown as Schema;

const entry = (text: string, type: SearchIndexEntry['type'], viewName: string, keywords?: string[]) =>
  ({ text, type, viewName, section: 'Management', breadcrumb: '', keywords }) as SearchIndexEntry;

const index = [
  entry('Domain name', 'field', 'x:Domain'),
  entry('DKIM signing', 'form', 'x:Domain'),
  entry('Domains', 'link', 'x:Domain', ['dns', 'zone']),
  entry('People', 'link', 'x:Account/User', ['users']),
  entry('Security', 'link', 'x:Security'),
  entry('Gone', 'link', 'x:Missing'),
];
const all = () => true;

describe('searchEntries', () => {
  it('needs every word, in the text or the keywords, ignoring case', () => {
    expect(searchEntries(index, 'domain', schema, all).map((e) => e.text)).toEqual(['Domains', 'Domain name']);
    expect(searchEntries(index, '  DNS   zone ', schema, all).map((e) => e.text)).toEqual(['Domains']);
    expect(searchEntries(index, 'domain users', schema, all)).toEqual([]);
  });

  it('puts pages first, then sections, then fields', () => {
    const results = searchEntries(index, 'd', schema, all);
    expect(results.map((e) => e.type)).toEqual(['link', 'form', 'field']);
  });

  it('leaves out what the account may not read, and unknown views', () => {
    expect(searchEntries(index, 'people', schema, (p) => p !== 'sysAccount')).toEqual([]);
    expect(searchEntries(index, 'gone', schema, all)).toEqual([]);
  });

  it('finds nothing without a query or a schema', () => {
    expect(searchEntries(index, '   ', schema, all)).toEqual([]);
    expect(searchEntries(index, 'domain', null, all)).toEqual([]);
  });

  it('keeps at most fifteen', () => {
    const many = Array.from({ length: 20 }, (_, i) => entry(`Domain ${i}`, 'field', 'x:Domain'));
    expect(searchEntries(many, 'domain', schema, all)).toHaveLength(MAX_RESULTS);
  });
});

describe('groupByType', () => {
  it('groups by kind in order of first appearance', () => {
    const groups = groupByType([index[2], index[0], index[3]]);
    expect([...groups.keys()]).toEqual(['link', 'field']);
    expect(groups.get('link')!.map((e) => e.text)).toEqual(['Domains', 'People']);
  });
});

describe('where a result leads', () => {
  it('opens settings as the singleton, pages as lists, the rest as a new record', () => {
    expect(getObjectKind(schema, 'x:Security')).toBe('singleton');
    expect(getObjectKind(schema, 'x:Account/User')).toBe('object');
    expect(getObjectKind(schema, 'x:Missing')).toBeNull();
    expect(entryPath(index[4], 'singleton')).toBe('/Management/x:Security/singleton');
    expect(entryPath(index[2], 'object')).toBe('/Management/x:Domain');
    expect(entryPath(index[0], 'object')).toBe('/Management/x:Domain/new');
  });

  it('labels the result to match', () => {
    const t = (_k: string, fallback: string) => fallback;
    expect(getActionInfo('field', 'singleton', t)).toEqual({ label: 'Settings', Icon: Settings });
    expect(getActionInfo('link', 'object', t)).toEqual({ label: 'List', Icon: List });
    expect(getActionInfo('form', null, t)).toEqual({ label: 'Create', Icon: Plus });
  });

  it('names a view after its last part', () => {
    expect(friendlyName('x:Account/User')).toBe('User');
    expect(friendlyName('x:Domain')).toBe('Domain');
    expect(friendlyName('Plain text')).toBe('Plain text');
  });
});
