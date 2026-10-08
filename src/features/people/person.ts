/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what a person's card shows (admin UX roadmap, item 10), read from a
 * People list row. Initials only: account pictures were decided against.
 */

/** Properties a card needs beyond the list's own columns. */
export const PERSON_CARD_PROPERTIES = ['usedDiskQuota', 'quotas', 'roles', 'memberGroupIds'];

export interface Person {
  /** The full name, when one is set. */
  name?: string;
  address: string;
  initials: string;
  /** A hue (0–359) for the initials circle, the same for the same address every time. */
  hue: number;
  used: number;
  /** The storage limit in bytes, or null for none. */
  quota: number | null;
  /** How full, 0–1, when there is a limit. */
  fill: number | null;
  role: 'admin' | 'custom' | 'user';
  groups: number;
  createdAt?: string;
}

/** Two letters: first and last name, or the start of the address. */
export function initialsOf(name: string | undefined, address: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = address.split('@')[0].replace(/[^\p{L}\p{N}]/gu, '');
  return (local.slice(0, 2) || '?').toUpperCase();
}

/** A stable hue for an address. */
export function hueOf(seed: string): number {
  let h = 0;
  for (const ch of seed.toLowerCase()) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return h % 360;
}

export function personOf(item: Record<string, unknown>): Person {
  const address = String(item.emailAddress ?? item.name ?? item.id ?? '');
  const name = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined;
  const quotas = (item.quotas ?? {}) as Record<string, unknown>;
  const quota = typeof quotas.maxDiskQuota === 'number' && quotas.maxDiskQuota > 0 ? quotas.maxDiskQuota : null;
  const used = typeof item.usedDiskQuota === 'number' ? item.usedDiskQuota : 0;
  const roleType = (item.roles as { '@type'?: string } | undefined)?.['@type'];
  return {
    name,
    address,
    initials: initialsOf(name, address),
    hue: hueOf(address),
    used,
    quota,
    fill: quota ? Math.min(1, used / quota) : null,
    role: roleType === 'Admin' ? 'admin' : roleType === 'Custom' ? 'custom' : 'user',
    groups:
      item.memberGroupIds && typeof item.memberGroupIds === 'object' ? Object.keys(item.memberGroupIds).length : 0,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : undefined,
  };
}
