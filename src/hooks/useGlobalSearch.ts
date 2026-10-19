/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { entryPath, getObjectKind, groupByType, searchEntries } from '@/lib/globalSearch';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore, type SearchIndexEntry } from '@/stores/schemaStore';

const DEBOUNCE_MS = 300;

/** The command bar's search: the query as typed, results for it once typing pauses, and opening one. */
export function useGlobalSearch(onAfterSelect?: () => void) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const schema = useSchemaStore((s) => s.schema);
  const searchIndex = useSchemaStore((s) => s.searchIndex);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);

  const type = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setDebouncedQuery(value), DEBOUNCE_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  const groups = useMemo(
    () =>
      groupByType(searchEntries(searchIndex, debouncedQuery, schema, (prefix) => hasObjectPermission(prefix, 'Get'))),
    [debouncedQuery, searchIndex, schema, hasObjectPermission],
  );

  const selectEntry = useCallback(
    (entry: SearchIndexEntry) => {
      if (!schema) return;
      navigate(entryPath(entry, getObjectKind(schema, entry.viewName)));
      onAfterSelect?.();
    },
    [schema, navigate, onAfterSelect],
  );

  const reset = useCallback(() => {
    clearTimeout(timer.current);
    setQuery('');
    setDebouncedQuery('');
  }, []);

  return { query, setQuery: type, debouncedQuery, groups, selectEntry, reset, schema };
}
