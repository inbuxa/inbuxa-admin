/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { withExtraColumns } from './listColumns';
import type { List, Schema } from '@/types/schema';

function list(columns: List['columns']): List {
  return { title: 'Directories', subtitle: '', singularName: 'directory', pluralName: 'directories', columns };
}

function schema(lists: Record<string, List>): Schema {
  return { lists } as unknown as Schema;
}

describe('withExtraColumns', () => {
  it('adds Description after Type on the Directories list', () => {
    const out = withExtraColumns(schema({ 'x:Directory': list([{ name: '@type', label: 'Type' }]) }));
    expect(out.lists['x:Directory'].columns).toEqual([
      { name: '@type', label: 'Type' },
      { name: 'description', label: 'Description' },
    ]);
  });

  it('leaves a list that already has the column alone', () => {
    const served = schema({
      'x:Directory': list([
        { name: 'description', label: 'Name' },
        { name: '@type', label: 'Type' },
      ]),
    });
    expect(withExtraColumns(served)).toBe(served);
  });

  it('leaves other lists, and a schema without the list, alone', () => {
    const served = schema({ 'x:Domain': list([{ name: 'name', label: 'Name' }]) });
    expect(withExtraColumns(served)).toBe(served);
  });
});
