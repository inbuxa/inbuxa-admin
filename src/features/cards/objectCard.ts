/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what a card shows for the lists beyond People (mailing lists,
 * tenants, roles, OAuth clients, domains), read from the list's row.
 */

import { hueOf, initialsOf } from '@/features/people/person';
import type { CardKind } from './layout';

/** How many entries a JMAP set or object list holds, whichever shape the wire used. */
export function countOf(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** A domain's DNS, signing keys or certificates: run for it, or by hand. */
function managed(value: unknown): boolean {
  return (value as { '@type'?: string } | undefined)?.['@type'] === 'Automatic';
}

export interface MailingListCard {
  kind: 'mailingList';
  title: string;
  address?: string;
  initials: string;
  hue: number;
  recipients: number;
  aliases: number;
}

export interface TenantCard {
  kind: 'tenant';
  title: string;
  initials: string;
  hue: number;
  used: number;
  quota: number | null;
  fill: number | null;
  createdAt?: string;
}

export interface RoleCard {
  kind: 'role';
  title: string;
  granted: number;
  removed: number;
  includes: number;
}

export interface OAuthClientCard {
  kind: 'oauthClient';
  title: string;
  clientId: string;
  redirects: number;
  expiresAt?: string;
  expired: boolean;
  createdAt?: string;
}

export interface DomainCard {
  kind: 'domain';
  title: string;
  description?: string;
  enabled: boolean;
  dns: boolean;
  dkim: boolean;
  certs: boolean;
  aliases: number;
  createdAt?: string;
}

export type ObjectCardModel = MailingListCard | TenantCard | RoleCard | OAuthClientCard | DomainCard;

export function cardOf(
  kind: Exclude<CardKind, 'person' | 'group'>,
  item: Record<string, unknown>,
  now = Date.now(),
): ObjectCardModel {
  const id = String(item.id ?? '');
  const createdAt = text(item.createdAt);
  switch (kind) {
    case 'mailingList': {
      const address = text(item.emailAddress);
      const title = text(item.description) ?? text(item.name) ?? address ?? id;
      return {
        kind,
        title,
        address: address !== title ? address : undefined,
        initials: initialsOf(text(item.description), address ?? title),
        hue: hueOf(address ?? title),
        recipients: countOf(item.recipients),
        aliases: countOf(item.aliases),
      };
    }
    case 'tenant': {
      const title = text(item.name) ?? id;
      const quotas = (item.quotas ?? {}) as Record<string, unknown>;
      const quota = typeof quotas.maxDiskQuota === 'number' && quotas.maxDiskQuota > 0 ? quotas.maxDiskQuota : null;
      const used = typeof item.usedDiskQuota === 'number' ? item.usedDiskQuota : 0;
      return {
        kind,
        title,
        initials: initialsOf(title, title),
        hue: hueOf(title),
        used,
        quota,
        fill: quota ? Math.min(1, used / quota) : null,
        createdAt,
      };
    }
    case 'role':
      return {
        kind,
        title: text(item.description) ?? id,
        granted: countOf(item.enabledPermissions),
        removed: countOf(item.disabledPermissions),
        includes: countOf(item.roleIds),
      };
    case 'oauthClient': {
      const clientId = text(item.clientId) ?? id;
      const expiresAt = text(item.expiresAt);
      return {
        kind,
        title: text(item.description) ?? clientId,
        clientId,
        redirects: countOf(item.redirectUris),
        expiresAt,
        expired: expiresAt ? new Date(expiresAt).getTime() < now : false,
        createdAt,
      };
    }
    case 'domain':
      return {
        kind,
        title: text(item.name) ?? id,
        description: text(item.description),
        enabled: item.isEnabled !== false,
        dns: managed(item.dnsManagement),
        dkim: managed(item.dkimManagement),
        certs: managed(item.certificateManagement),
        aliases: countOf(item.aliases),
        createdAt,
      };
  }
}
