/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names; where two Tailwind classes set the same thing, the later one wins. */
export const cn = (...classes: ClassValue[]): string => twMerge(clsx(classes));
