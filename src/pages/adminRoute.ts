/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The console's routing decisions: reading the address, the tab title, the session, and where to land. */
import type { TFunction } from 'i18next';
import type { Dashboard, Schema } from '@/types/schema';
import type { SearchIndexEntry } from '@/stores/schemaStore';
import {
  findFirstAccessibleLinkInLayout,
  findFirstVisibleLinkInLayout,
  isLinkAccessible,
  visibleLayouts,
  type CanGet,
  type HasPermission,
} from '@/lib/layout';
import { sectionLandingLink } from '@/lib/lastVisited';
import { friendlyName } from '@/lib/globalSearch';

/**
 * The page and record an address names, from what follows the section.
 * A trailing `new` or `singleton` is the record; otherwise the whole path
 * is a view if the schema knows it, else all but the last part is a view
 * and the last part a record id.
 */
export function parseAdminPath(
  splat: string | undefined,
  objects: Schema['objects'] | undefined,
): { viewName?: string; id?: string } {
  if (!splat) return {};
  const parts = splat.split('/');
  const last = parts[parts.length - 1];
  const head = parts.slice(0, -1).join('/');
  if (last === 'new' || last === 'singleton') return { viewName: head, id: last };
  if (objects?.[splat] || parts.length === 1 || !objects?.[head]) return { viewName: splat };
  return { viewName: head, id: last };
}

interface TitleContext {
  section?: string;
  viewName?: string;
  id?: string;
  searchIndex: SearchIndexEntry[];
  dashboards?: Dashboard[];
}

function wizardTitle(t: TFunction, viewName: string): string | null {
  if (viewName.startsWith('Wizard/dns/')) return t('dnsWizard.tabTitle', 'Publish DNS');
  switch (viewName) {
    case 'Wizard/limits':
      return t('limitsSetup.tabTitle', 'Limits');
    case 'Wizard/directory':
      return t('dirSetup.tabTitle', 'Sign-in directory');
    case 'Wizard/certificates':
      return t('certSetup.tabTitle', 'Certificates');
    case 'Wizard/sending':
      return t('sendingSetup.tabTitle', 'Sending mail');
  }
  return null;
}

/** The page's name as it appears in the navigation: this section's link first, else any. */
function linkLabel(searchIndex: SearchIndexEntry[], viewName: string, section: string): string | undefined {
  const links = searchIndex.filter((e) => e.type === 'link' && e.viewName === viewName);
  return (links.find((e) => e.section === section) ?? links[0])?.text;
}

/** The browser tab's title for a page: its name, then the section. */
export function adminPageTitle(t: TFunction, { section, viewName, id, searchIndex, dashboards }: TitleContext): string {
  const dashboard = t('dashboard.title', 'Dashboard');
  if (!section) return dashboard;
  if (!viewName) return section;

  const wizard = wizardTitle(t, viewName);
  if (wizard) return `${wizard} · ${section}`;

  if (viewName.startsWith('Dashboard/')) {
    const boardId = viewName.slice('Dashboard/'.length);
    // The landing page is the command center; Cluster isn't in the schema.
    if (boardId === 'overview') return t('cc.back', 'Command center');
    if (boardId === 'cluster') return `${t('cc.cluster', 'Cluster')} · ${dashboard}`;
    return `${dashboards?.find((d) => d.id === boardId)?.label ?? dashboard} · ${dashboard}`;
  }

  const name = linkLabel(searchIndex, viewName, section) ?? friendlyName(viewName);
  return `${id === 'new' ? t('form.createTitle', 'Create {{name}}', { name }) : name} · ${section}`;
}

export interface SessionInfo {
  accounts: Record<string, { name: string; isPersonal: boolean }>;
  primaryAccountId: string;
  apiUrl: string;
  maxObjectsInGet?: number;
  maxObjectsInSet?: number;
}

const numberOrUndefined = (v: unknown) => (typeof v === 'number' ? v : undefined);

/** What the console keeps from the JMAP session. */
export function readSessionInfo(session: Record<string, unknown>): SessionInfo {
  const accounts = Object.fromEntries(
    Object.entries(session.accounts as Record<string, { name: string; isPersonal: boolean }>).map(
      ([id, { name, isPersonal }]) => [id, { name, isPersonal }],
    ),
  );
  const primary = session.primaryAccounts as Record<string, string>;
  const core = (session.capabilities as Record<string, Record<string, unknown>> | undefined)?.[
    'urn:ietf:params:jmap:core'
  ];
  return {
    accounts,
    primaryAccountId: primary['urn:ietf:params:jmap:core'] ?? Object.values(primary)[0] ?? Object.keys(accounts)[0],
    apiUrl: (session.apiUrl as string) || '/jmap',
    maxObjectsInGet: numberOrUndefined(core?.maxObjectsInGet),
    maxObjectsInSet: numberOrUndefined(core?.maxObjectsInSet),
  };
}

/** Permission checks over the account's permission list. */
export function permissionChecks(permissions: string[]): { canGet: CanGet; hasPerm: HasPermission } {
  return {
    canGet: (prefix) => permissions.includes(`${prefix}Get`),
    hasPerm: (perm) => permissions.includes(perm),
  };
}

export type Landing =
  /** Go to this section's page; with no page, only mark the section as current. */
  | { kind: 'redirect'; section: string; link: string | null }
  /** Stay, marking this section as current, and remember the page for its section. */
  | { kind: 'stay'; section: string; remember: { section: string; viewName: string } | null }
  | null;

/**
 * Where an address leads. A page the account can't open goes to its first
 * page it can; a section alone opens where it was last left; no section at
 * all opens the first section with a page to show.
 */
export function landing(
  schema: Schema,
  edition: string,
  permissions: string[],
  section: string | undefined,
  viewName: string | undefined,
): Landing {
  const { canGet, hasPerm } = permissionChecks(permissions);
  const layouts = visibleLayouts(schema, edition, canGet, hasPerm);
  const own = section ? layouts.find((l) => l.name.toLowerCase() === section.toLowerCase()) : undefined;

  const firstPage = (): Landing => {
    for (const layout of layouts) {
      const link = findFirstAccessibleLinkInLayout(schema, layout, edition, canGet, hasPerm);
      if (link) return { kind: 'redirect', section: layout.name, link };
    }
    const [first] = layouts;
    if (!first) return null;
    return {
      kind: 'redirect',
      section: first.name,
      link: findFirstVisibleLinkInLayout(schema, first, edition, canGet, hasPerm),
    };
  };

  if (section && viewName) {
    if (!isLinkAccessible(schema, viewName, edition, canGet, hasPerm)) {
      const fallback = firstPage();
      if (fallback?.kind === 'redirect' && (fallback.section !== section || fallback.link !== viewName)) {
        return fallback;
      }
    }
    return {
      kind: 'stay',
      section: own?.name ?? layouts[0]?.name ?? section,
      remember: own ? { section: own.name, viewName } : null,
    };
  }

  if (own) {
    const link = sectionLandingLink(schema, own, edition, canGet, hasPerm);
    if (link) return { kind: 'redirect', section: own.name, link };
  }
  return firstPage();
}
