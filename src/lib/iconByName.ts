/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as LucideIcons from 'lucide-react';

/** The icon the schema names in kebab case (`sliders-horizontal`), or a plain circle for one it doesn't know. */
export function iconByName(name: string): LucideIcons.LucideIcon {
  const pascal = name
    .split('-')
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join('');
  return ((LucideIcons as Record<string, unknown>)[pascal] as LucideIcons.LucideIcon | undefined) ?? LucideIcons.Circle;
}
