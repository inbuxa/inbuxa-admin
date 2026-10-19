/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Edits to an expression's IF/THEN list and its ELSE, each giving a new value. */

export interface Condition {
  if: string;
  then: string;
}

export interface ExpressionValue {
  match: Record<string, Condition>;
  else: string;
}

/** The key a new condition gets: one past the highest numbered key, so none is reused. */
export function nextConditionKey(match: Record<string, Condition>): number {
  const numbered = Object.keys(match).map(Number).filter(Number.isFinite);
  return numbered.length > 0 ? Math.max(...numbered) + 1 : 0;
}

export function withConditionPart(
  value: ExpressionValue,
  key: string,
  part: keyof Condition,
  text: string,
): ExpressionValue {
  return { ...value, match: { ...value.match, [key]: { ...value.match[key], [part]: text } } };
}

export function withAddedCondition(value: ExpressionValue, key: string): ExpressionValue {
  return { ...value, match: { ...value.match, [key]: { if: '', then: '' } } };
}

export function withoutCondition(value: ExpressionValue, key: string): ExpressionValue {
  return { ...value, match: Object.fromEntries(Object.entries(value.match).filter(([k]) => k !== key)) };
}

export function withElse(value: ExpressionValue, text: string): ExpressionValue {
  return { ...value, else: text };
}
