/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The command bar's rows, each with the value the list highlights it by. */
import type { PaletteCommand } from '@/features/commands/commands';
import type { SearchIndexEntry } from '@/stores/schemaStore';

export const commandRow = (command: Pick<PaletteCommand, 'id'>) => `command-${command.id}`;

export const entryRow = (type: SearchIndexEntry['type'], position: number, viewName: string) =>
  `${type}-${position}-${viewName}`;

/** Every row's value, top to bottom: commands, then each group of results. */
export function paletteRows(
  commands: Pick<PaletteCommand, 'id'>[],
  groups: Map<SearchIndexEntry['type'], SearchIndexEntry[]>,
): string[] {
  return [
    ...commands.map(commandRow),
    ...[...groups].flatMap(([type, entries]) => entries.map((entry, i) => entryRow(type, i, entry.viewName))),
  ];
}
