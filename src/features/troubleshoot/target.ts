/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** What a delivery trace accepts: an email address or a domain. Shared with the command palette. */
export function isValidTarget(target: string): boolean {
  target = target.trim();
  if (!target) return false;
  if (target.includes('@')) {
    const [local, domain] = target.split('@');
    return local.length > 0 && domain.length > 0 && domain.includes('.');
  }
  return target.includes('.');
}
