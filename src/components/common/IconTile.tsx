/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createElement } from 'react';
import * as LucideIcons from 'lucide-react';
import { cn } from '@/lib/utils';
import { toneFor, type Tone } from '@/lib/iconTones';

const TONE_CLASSES: Record<Tone, string> = {
  teal: 'bg-teal-500/15 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300',
  orange: 'bg-orange-400/20 text-orange-700 dark:bg-orange-400/15 dark:text-orange-300',
  sky: 'bg-sky-500/15 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300',
  violet: 'bg-violet-500/15 text-violet-700 dark:bg-violet-400/15 dark:text-violet-300',
  rose: 'bg-rose-500/15 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300',
  amber: 'bg-amber-400/20 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300',
  emerald: 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300',
  indigo: 'bg-indigo-500/15 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300',
  slate: 'bg-slate-500/15 text-slate-700 dark:bg-slate-400/15 dark:text-slate-300',
};

function iconComponent(name: string): LucideIcons.LucideIcon {
  const pascal = name
    .split('-')
    .map((s) => (s ? s[0].toUpperCase() + s.slice(1) : s))
    .join('');
  return ((LucideIcons as Record<string, unknown>)[pascal] as LucideIcons.LucideIcon | undefined) ?? LucideIcons.Circle;
}

/**
 * A section's icon on a small colored tile. The color comes from what the
 * section is about (see iconTones), so the same kind of thing looks the same
 * everywhere, and a glance at the color finds it.
 */
export function IconTile({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'sm' ? 'h-6 w-6 rounded-md' : size === 'lg' ? 'h-10 w-10 rounded-xl' : 'h-7 w-7 rounded-lg';
  const glyph = size === 'sm' ? 'h-3.5 w-3.5' : size === 'lg' ? 'h-5 w-5' : 'h-4 w-4';
  return (
    <span
      className={cn('inline-flex shrink-0 items-center justify-center', box, TONE_CLASSES[toneFor(name)], className)}
    >
      {createElement(iconComponent(name), { className: glyph, strokeWidth: 2, 'aria-hidden': true })}
    </span>
  );
}
