/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * A local copy of `value` that a field edits freely (half-typed text, say),
 * replaced whenever `value` itself changes. `transform` turns the value into
 * what the field edits. The copy is replaced during render, not in an
 * effect, so the field never shows the old value for a frame.
 */
export function useBufferedValue<T, S = T>(
  value: T,
  transform: (v: T) => S = (v) => v as unknown as S,
): [S, Dispatch<SetStateAction<S>>] {
  const [source, setSource] = useState(value);
  const [draft, setDraft] = useState<S>(() => transform(value));
  if (!Object.is(source, value)) {
    setSource(value);
    setDraft(transform(value));
  }
  return [draft, setDraft];
}

/** Calls `reset` during render whenever `key` changes, to drop state tied to the old key. */
export function useResetOnChange<K>(key: K, reset: () => void): void {
  const [seen, setSeen] = useState(key);
  if (!Object.is(seen, key)) {
    setSeen(key);
    reset();
  }
}
