/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: which lists show cards (admin UX roadmap, item 10, carried from
 * People to the rest of Directory and to Domains). Cards are the default;
 * the plain list is one press away, and the choice is remembered per list.
 */

import { PERSON_CARD_PROPERTIES } from '@/features/people/person';

export type CardKind = 'person' | 'group' | 'mailingList' | 'tenant' | 'role' | 'oauthClient' | 'domain';

/** The lists that can show cards, and what each card is. */
export const CARD_VIEWS: Record<string, CardKind> = {
  'x:Account/User': 'person',
  'x:Account/Group': 'group',
  'x:MailingList': 'mailingList',
  'x:Tenant': 'tenant',
  'x:Role': 'role',
  'x:OAuthClient': 'oauthClient',
  'x:Domain': 'domain',
};

/** Properties a card needs beyond the list's own columns. */
const CARD_PROPERTIES: Record<CardKind, string[]> = {
  person: PERSON_CARD_PROPERTIES,
  // A group is in no groups: it has no memberGroupIds to ask for
  group: ['usedDiskQuota', 'quotas', 'roles'],
  mailingList: ['name', 'description', 'emailAddress', 'recipients', 'aliases'],
  tenant: ['name', 'usedDiskQuota', 'quotas', 'createdAt'],
  role: ['description', 'enabledPermissions', 'disabledPermissions', 'roleIds'],
  oauthClient: ['clientId', 'description', 'redirectUris', 'expiresAt', 'createdAt'],
  domain: [
    'name',
    'description',
    'isEnabled',
    'dnsManagement',
    'dkimManagement',
    'certificateManagement',
    'aliases',
    'createdAt',
  ],
};

export function cardKindOf(viewName: string): CardKind | undefined {
  return CARD_VIEWS[viewName];
}

export function cardPropertiesFor(viewName: string): string[] {
  const kind = cardKindOf(viewName);
  return kind ? CARD_PROPERTIES[kind] : [];
}

/** Cards or the plain list, remembered per browser and per list. */
export type ListLayout = 'cards' | 'table';

const keyOf = (viewName: string) => `inbuxa-list-layout:${viewName}`;
/** Where People kept its choice before every list had one. */
const PEOPLE_KEY = 'inbuxa-people-layout';

export function readListLayout(viewName: string): ListLayout {
  try {
    const stored =
      localStorage.getItem(keyOf(viewName)) ??
      (viewName === 'x:Account/User' ? localStorage.getItem(PEOPLE_KEY) : null);
    return stored === 'table' ? 'table' : 'cards';
  } catch {
    return 'cards';
  }
}

export function writeListLayout(viewName: string, layout: ListLayout) {
  try {
    localStorage.setItem(keyOf(viewName), layout);
  } catch {
    // Private windows can refuse storage; the choice just isn't remembered.
  }
}
