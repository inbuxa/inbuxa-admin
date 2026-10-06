/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import type { Schema } from '@/types/schema';
import type { SearchIndexEntry } from '@/stores/schemaStore';
import { buildCommands, matchCommands, type CommandContext } from './commands';

const schema = {
  objects: {
    'x:Action': { type: 'object', description: '', permissionPrefix: 'sysAction' },
    'x:MtaOutboundStrategy': { type: 'singleton', description: '', permissionPrefix: 'sysMtaOutboundStrategy' },
    'x:Directory': { type: 'object', description: '', permissionPrefix: 'sysDirectory' },
  },
  schemas: {
    'x:Action': {
      type: 'multiple',
      variants: [
        { name: 'ReloadSettings', label: 'Reload: Server settings' },
        { name: 'PauseMtaQueue', label: 'MTA: Pause queue processing' },
        { name: 'ClassifySpam', label: 'Spam Filter: Classify a message', schemaName: 'x:SpamClassify' },
      ],
    },
  },
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [],
} as unknown as Schema;

const searchIndex: SearchIndexEntry[] = [
  { text: 'Actions', type: 'link', viewName: 'x:Action', section: 'Management', breadcrumb: 'Management' },
];

function context(over: Partial<CommandContext> = {}): CommandContext {
  return {
    schema,
    searchIndex,
    viewToSection: { 'CustomComponent/LiveDelivery': 'Management' },
    hasPermission: () => true,
    hasObjectPermission: () => true,
    theme: 'light',
    t: (_key, fallback, options) =>
      fallback.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String((options as Record<string, unknown>)?.[k] ?? '')),
    ...over,
  };
}

const ids = (cs: { id: string }[]) => cs.map((c) => c.id);

describe('buildCommands', () => {
  it('offers each server action, opening the Actions page with it picked', () => {
    const commands = buildCommands(context());
    const pause = commands.find((c) => c.id === 'action:PauseMtaQueue');
    expect(pause?.label).toBe('MTA: Pause queue processing');
    expect(pause?.hint).toBe('Server action');
    expect(pause?.kind).toEqual({ type: 'navigate', to: '/Management/x:Action?action=PauseMtaQueue' });
  });

  it('leaves out actions the account may not run', () => {
    const commands = buildCommands(context({ hasPermission: (p) => p !== 'actionPauseMtaQueue' }));
    expect(ids(commands)).not.toContain('action:PauseMtaQueue');
    expect(ids(commands)).toContain('action:ReloadSettings');
  });

  it('offers no server action without permission to create one', () => {
    const commands = buildCommands(context({ hasObjectPermission: (prefix) => prefix !== 'sysAction' }));
    expect(ids(commands).filter((id) => id.startsWith('action:'))).toEqual([]);
  });

  it('offers a guided setup only to whoever may change what it sets up', () => {
    const commands = buildCommands(
      context({ hasObjectPermission: (prefix, action) => !(prefix === 'sysDirectory' && action === 'Update') }),
    );
    expect(ids(commands)).toContain('guide:sending');
    expect(ids(commands)).not.toContain('guide:directory');
    // Not in this schema at all, so never offered.
    expect(ids(commands)).not.toContain('guide:limits');
  });

  it('names the theme it switches to', () => {
    expect(buildCommands(context()).find((c) => c.id === 'app:theme')?.label).toBe('Switch to the dark theme');
    expect(buildCommands(context({ theme: 'dark' })).find((c) => c.id === 'app:theme')?.label).toBe(
      'Switch to the light theme',
    );
  });
});

describe('matchCommands', () => {
  const ctx = context();
  const all = buildCommands(ctx);

  it('needs every word typed', () => {
    expect(ids(matchCommands(all, 'pause queue', ctx))).toEqual(['action:PauseMtaQueue']);
    expect(ids(matchCommands(all, 'pause settings', ctx))).toEqual([]);
  });

  it('matches keywords as well as labels', () => {
    expect(ids(matchCommands(all, 'ldap', ctx))).toEqual(['guide:directory']);
    expect(ids(matchCommands(all, 'logout', ctx))).toEqual(['app:signOut']);
  });

  it('offers nothing for an empty query', () => {
    expect(matchCommands(all, '   ', ctx)).toEqual([]);
  });

  it('offers a delivery trace for an address or a domain, first', () => {
    const found = matchCommands(all, 'someone@example.org', ctx);
    expect(found[0]).toMatchObject({
      id: 'trace',
      label: 'Trace delivery to someone@example.org',
      kind: { type: 'navigate', to: '/Management/CustomComponent/LiveDelivery?target=someone%40example.org' },
    });
    expect(ids(matchCommands(all, 'example.org', ctx))).toEqual(['trace']);
  });

  it('offers no trace for a plain word, or without permission to run one', () => {
    expect(ids(matchCommands(all, 'reload', ctx))).not.toContain('trace');
    const denied = context({ hasPermission: (p) => p !== 'liveDeliveryTest' });
    expect(ids(matchCommands(buildCommands(denied), 'example.org', denied))).toEqual([]);
  });
});
