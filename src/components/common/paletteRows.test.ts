/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { commandRow, entryRow, paletteRows } from './paletteRows';
import type { SearchIndexEntry } from '@/stores/schemaStore';

const entry = (viewName: string) => ({ viewName }) as SearchIndexEntry;

describe('paletteRows', () => {
  it('lists commands first, then each group in order, numbering within the group', () => {
    const groups = new Map<SearchIndexEntry['type'], SearchIndexEntry[]>([
      ['link', [entry('x:Domain'), entry('x:Account/User')]],
      ['field', [entry('x:Domain')]],
    ]);
    expect(paletteRows([{ id: 'theme' }, { id: 'trace' }], groups)).toEqual([
      'command-theme',
      'command-trace',
      'link-0-x:Domain',
      'link-1-x:Account/User',
      'field-0-x:Domain',
    ]);
  });

  it('is empty with nothing to show', () => {
    expect(paletteRows([], new Map())).toEqual([]);
  });

  it('names rows the way the list items are valued', () => {
    expect(commandRow({ id: 'signOut' })).toBe('command-signOut');
    expect(entryRow('form', 3, 'x:Security')).toBe('form-3-x:Security');
  });
});
