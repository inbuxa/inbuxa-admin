/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * An option's default, as words, and whether the current value differs
 * from it, so tooltips can say "Default: 5 min" and a form can mark what
 * someone has changed.
 */
import type { Field, Schema } from '@/types/schema';
import { formatDuration, formatSize } from '@/lib/durationFormat';

function stable(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Does the value differ from the default? An unset value counts as the default. */
export function differsFromDefault(value: unknown, def: unknown): boolean {
  if (def === undefined) return false;
  if (value === undefined || value === null) return false;
  return stable(value) !== stable(def);
}

/** The default as someone would say it, or null when there's nothing short to say. */
export function describeDefault(
  field: Field,
  def: unknown,
  schema: Schema,
  words: { on: string; off: string; none: string },
): string | null {
  if (def === undefined) return null;
  if (def === null) return words.none;
  const ft = field.type as { type: string; format?: string; enumName?: string; objectName?: string };
  if (typeof def === 'boolean') return def ? words.on : words.off;
  if (typeof def === 'number') {
    if (ft.format === 'duration') return formatDuration(def);
    if (ft.format === 'size') return formatSize(def);
    return String(def);
  }
  if (typeof def === 'string') {
    if (ft.type === 'enum' && ft.enumName) {
      return schema.enums[ft.enumName]?.find((e) => e.name === def)?.label ?? def;
    }
    return def.length > 60 ? null : def;
  }
  if (typeof def === 'object' && !Array.isArray(def)) {
    const variant = (def as Record<string, unknown>)['@type'];
    if (typeof variant === 'string' && ft.objectName) {
      const sch = schema.schemas[ft.objectName];
      const label = sch?.type === 'multiple' ? sch.variants.find((v) => v.name === variant)?.label : undefined;
      return label ?? variant;
    }
    const keys = Object.keys(def as Record<string, unknown>);
    if (ft.type === 'set') {
      if (keys.length === 0) return words.none;
      if (ft.enumName || (field.type as { class?: { enumName?: string } }).class?.enumName) {
        const en = (field.type as { class?: { enumName?: string } }).class?.enumName ?? ft.enumName!;
        const labels = keys.map((k) => schema.enums[en]?.find((e) => e.name === k)?.label ?? k);
        return labels.length > 4 ? `${labels.slice(0, 4).join(', ')}…` : labels.join(', ');
      }
      return keys.length > 4 ? `${keys.slice(0, 4).join(', ')}…` : keys.join(', ');
    }
  }
  return null;
}
