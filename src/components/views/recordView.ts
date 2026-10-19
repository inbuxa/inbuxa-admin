/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Reading one record for the read-only page, and naming it. */
import type { TFunction } from 'i18next';
import { coerceLabel } from '@/lib/objectOptions';
import type { JmapMethodResponse } from '@/types/jmap';
import type { List } from '@/types/schema';

/** The record from a `/get` answer; throws, with a message to show, when there isn't one. */
export function recordFrom(responses: JmapMethodResponse[], t: TFunction): Record<string, unknown> {
  const answer = responses.find(([name]) => name.endsWith('/get'));
  if (!answer) throw new Error(t('view.noGetResponse', 'No get response'));
  const record = (answer[1] as { list?: Record<string, unknown>[] }).list?.[0];
  if (!record) throw new Error(t('view.objectNotFound', 'Object not found'));
  return record;
}

const capitalized = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * The page heading: the kind of record, then its name if it has one,
 * as the list labels it (its label property, else its first column).
 */
export function recordTitle(list: List | null, objectName: string, record: Record<string, unknown>): string {
  const kind = capitalized(list?.singularName ?? objectName.replace(/^x:/, ''));
  const labelProperty = list?.labelProperty ?? list?.columns?.[0]?.name;
  const name = labelProperty ? coerceLabel(record[labelProperty], '') : '';
  return name ? `${kind}: ${name}` : kind;
}
