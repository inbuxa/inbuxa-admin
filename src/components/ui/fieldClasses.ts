/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The look the text fields share: Input and Textarea. */
export const fieldClasses = [
  'w-full min-w-0 rounded-lg border border-input bg-background/60 text-base shadow-sm transition-[color,box-shadow] outline-none md:text-sm',
  'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground',
  'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
  'aria-invalid:border-destructive aria-invalid:ring-destructive/20',
  'disabled:cursor-not-allowed disabled:opacity-50',
];
