/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** What the server sends in place of a secret's value. */
export const SECRET_MASK = '****';

/**
 * A list the server may send as an array or as an object keyed by position
 * ("0", "1", …), as an array in that order. Anything else is an empty list.
 */
export function jmapMapToArray<T>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  if (value === null || typeof value !== 'object') return [];
  const byIndex = Object.entries(value as Record<string, T>);
  byIndex.sort((a, b) => Number(a[0]) - Number(b[0]));
  return byIndex.map((entry) => entry[1]);
}
