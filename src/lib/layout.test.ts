/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { isLinkVisible, visibleLayouts } from './layout';
import { withRegroupedSettings, SETTINGS_OVERVIEW_VIEW } from './settingsLayout';
import type { Schema } from '@/types/schema';

// The shape a server in bootstrap mode serves: every layout present, and an
// administrator who may only read and write x:Bootstrap.
const served = {
  objects: {
    'x:Bootstrap': { type: 'singleton', description: '', permissionPrefix: 'sysBootstrap' },
    'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
    'x:MtaStageEhlo': { type: 'singleton', description: '', permissionPrefix: 'sysMtaStageEhlo' },
  },
  schemas: {},
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [
    {
      name: 'Management',
      icon: 'server',
      items: [
        { link: { name: 'Domains', icon: 'globe', viewName: 'x:Domain' } },
        { link: { name: 'Compliance', icon: 'scale', viewName: 'CustomComponent/ComplianceOverview' } },
        { link: { name: 'Coming soon', icon: 'sparkles', viewName: 'CustomComponent/NotInThisConsole' } },
      ],
    },
    {
      name: 'Settings',
      icon: 'sliders-horizontal',
      items: [
        {
          container: {
            name: 'MTA',
            icon: 'route',
            items: [{ type: 'link', name: 'EHLO Stage', viewName: 'x:MtaStageEhlo' }],
          },
        },
      ],
    },
  ],
} as unknown as Schema;

const schema = withRegroupedSettings(served);
const canGetFrom = (perms: string[]) => (prefix: string) => perms.includes(`${prefix}Get`);
const hasPermFrom = (perms: string[]) => (perm: string) => perms.includes(perm);

describe('layout visibility', () => {
  it('leaves the bootstrap administrator no layout, so the wizard shows (inbuxa-server#135)', () => {
    const perms = ['sysBootstrapGet', 'sysBootstrapUpdate'];
    expect(visibleLayouts(schema, 'enterprise', canGetFrom(perms), hasPermFrom(perms))).toEqual([]);
  });

  it('shows the Settings overview only beside a settings page the account may see', () => {
    const none = canGetFrom([]);
    const ehlo = canGetFrom(['sysMtaStageEhloGet']);
    expect(isLinkVisible(schema, SETTINGS_OVERVIEW_VIEW, 'enterprise', none)).toBe(false);
    expect(isLinkVisible(schema, SETTINGS_OVERVIEW_VIEW, 'enterprise', ehlo)).toBe(true);
    expect(visibleLayouts(schema, 'enterprise', ehlo).map((l) => l.name)).toEqual(['Settings']);
  });

  it('hides a page this console cannot draw', () => {
    const all = () => true;
    expect(isLinkVisible(schema, 'CustomComponent/NotInThisConsole', 'enterprise', all)).toBe(false);
  });
});
