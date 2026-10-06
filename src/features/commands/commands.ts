/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * What the command palette can do, beside finding a page: run a server
 * action, start a guided setup, trace a delivery, switch the theme, sign
 * out. Each command is offered only to someone allowed to carry it out.
 *
 * Nothing here runs a server action. Choosing one opens the Actions page
 * with it picked, where an action with options shows its form and one
 * without asks before it runs (see `ActionPage`'s `?action=`).
 */
import type { Schema } from '@/types/schema';
import type { SearchIndexEntry } from '@/stores/schemaStore';
import { resolveObject, resolveSchema } from '@/lib/schemaResolver';
import { isValidTarget } from '@/features/troubleshoot/target';

/** The guided setups the palette can start, each through its own "Guided or manual?". */
export type LaunchJob = 'sending' | 'limits' | 'directory' | 'certificates';

export type CommandKind =
  { type: 'navigate'; to: string } | { type: 'launch'; job: LaunchJob } | { type: 'theme' } | { type: 'signOut' };

export interface PaletteCommand {
  id: string;
  label: string;
  /** A second line: the group an action belongs to, or what the command will do. */
  hint: string;
  icon: 'action' | 'guide' | 'trace' | 'theme' | 'signOut';
  keywords: string[];
  kind: CommandKind;
}

type T = (key: string, fallback: string, options?: Record<string, unknown>) => string;

export interface CommandContext {
  schema: Schema;
  searchIndex: SearchIndexEntry[];
  viewToSection: Record<string, string>;
  hasPermission: (perm: string) => boolean;
  hasObjectPermission: (prefix: string, action: 'Get' | 'Query' | 'Create' | 'Update' | 'Destroy') => boolean;
  theme: 'light' | 'dark';
  t: T;
}

/** The page that lists server actions, as the layouts reach it. */
function actionsPage(ctx: CommandContext): { section: string; viewName: string } | null {
  for (const entry of ctx.searchIndex) {
    if (entry.type !== 'link') continue;
    if (resolveObject(ctx.schema, entry.viewName)?.objectName === 'x:Action') {
      return { section: entry.section, viewName: entry.viewName };
    }
  }
  return null;
}

function serverActions(ctx: CommandContext): PaletteCommand[] {
  const page = actionsPage(ctx);
  if (!page) return [];
  const resolved = resolveObject(ctx.schema, page.viewName);
  if (!resolved || !ctx.hasObjectPermission(resolved.permissionPrefix, 'Create')) return [];
  const sch = resolveSchema(ctx.schema, resolved.objectName);
  if (sch?.type !== 'multiple') return [];
  const out: PaletteCommand[] = [];
  for (const v of sch.variants) {
    if (!ctx.hasPermission(`action${v.name}`)) continue;
    // The whole label, "Group: Action": in a list beside pages, "Server
    // settings" alone reads like the page, where "Reload: Server settings" doesn't.
    out.push({
      id: `action:${v.name}`,
      label: v.label,
      hint: ctx.t('commands.actionHint', 'Server action'),
      icon: 'action',
      keywords: [v.name, 'action', 'run'],
      kind: {
        type: 'navigate',
        to: `/${page.section}/${page.viewName}?action=${encodeURIComponent(v.name)}`,
      },
    });
  }
  return out;
}

/** Each guided setup, offered to whoever may change what it sets up. */
const GUIDES: { job: LaunchJob; object: string; label: (t: T) => string; keywords: string[] }[] = [
  {
    job: 'sending',
    object: 'x:MtaOutboundStrategy',
    label: (t) => t('commands.guideSending', 'Set up how this server sends mail'),
    keywords: ['relay', 'smarthost', 'port 25', 'outbound', 'delivery'],
  },
  {
    job: 'limits',
    object: 'x:MtaInboundThrottle',
    label: (t) => t('commands.guideLimits', 'Set up sending and receiving limits'),
    keywords: ['rate', 'throttle', 'quota'],
  },
  {
    job: 'directory',
    object: 'x:Directory',
    label: (t) => t('commands.guideDirectory', 'Connect a sign-in directory'),
    keywords: ['ldap', 'sql', 'oidc', 'active directory', 'sso'],
  },
  {
    job: 'certificates',
    object: 'x:Certificate',
    label: (t) => t('commands.guideCertificates', 'Set up automatic certificates'),
    keywords: ['acme', "let's encrypt", 'letsencrypt', 'tls', 'https'],
  },
];

function guides(ctx: CommandContext): PaletteCommand[] {
  const hint = ctx.t('commands.guideHint', 'Guided or manual, you choose next');
  return GUIDES.filter((g) => {
    const resolved = resolveObject(ctx.schema, g.object);
    return resolved ? ctx.hasObjectPermission(resolved.permissionPrefix, 'Update') : false;
  }).map((g) => ({
    id: `guide:${g.job}`,
    label: g.label(ctx.t),
    hint,
    icon: 'guide' as const,
    keywords: [...g.keywords, 'guide', 'wizard', 'setup'],
    kind: { type: 'launch' as const, job: g.job },
  }));
}

function appCommands(ctx: CommandContext): PaletteCommand[] {
  return [
    {
      id: 'app:theme',
      label:
        ctx.theme === 'dark'
          ? ctx.t('commands.themeLight', 'Switch to the light theme')
          : ctx.t('commands.themeDark', 'Switch to the dark theme'),
      hint: ctx.t('commands.appHint', 'This browser'),
      icon: 'theme',
      keywords: ['theme', 'dark', 'light', 'mode', 'appearance'],
      kind: { type: 'theme' },
    },
    {
      id: 'app:signOut',
      label: ctx.t('commands.signOut', 'Sign out'),
      hint: ctx.t('commands.appHint', 'This browser'),
      icon: 'signOut',
      keywords: ['logout', 'log out', 'sign off'],
      kind: { type: 'signOut' },
    },
  ];
}

/** Every command that doesn't depend on what was typed. */
export function buildCommands(ctx: CommandContext): PaletteCommand[] {
  return [...serverActions(ctx), ...guides(ctx), ...appCommands(ctx)];
}

/**
 * The commands that match a query: every word typed must appear in the label,
 * the hint or a keyword. An address or domain also offers a delivery trace to
 * it, for whoever may run one.
 */
export function matchCommands(commands: PaletteCommand[], query: string, ctx: CommandContext): PaletteCommand[] {
  const q = query.trim();
  const tokens = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const matched = commands.filter((c) => {
    const haystack = [c.label, c.hint, ...c.keywords].join(' ').toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
  if (tokens.length === 1 && isValidTarget(q) && ctx.hasPermission('liveDeliveryTest')) {
    const section = ctx.viewToSection['CustomComponent/LiveDelivery'];
    if (section) {
      matched.unshift({
        id: 'trace',
        label: ctx.t('commands.trace', 'Trace delivery to {{target}}', { target: q }),
        hint: ctx.t('commands.traceHint', 'Opens the delivery test with this filled in'),
        icon: 'trace',
        keywords: [],
        kind: { type: 'navigate', to: `/${section}/CustomComponent/LiveDelivery?target=${encodeURIComponent(q)}` },
      });
    }
  }
  return matched;
}
