/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { regroupSettings, SETTINGS_CATEGORIES, SETTINGS_OVERVIEW_VIEW, withRegroupedSettings } from './settingsLayout';
import type { Layout, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';

const served: Layout = {
  name: 'Settings',
  icon: 'sliders-horizontal',
  items: [
    {
      container: {
        name: 'MTA',
        icon: 'route',
        items: [
          {
            type: 'container',
            name: 'Session',
            items: [
              { type: 'link', name: 'EHLO Stage', viewName: 'x:MtaStageEhlo' },
              { type: 'link', name: 'Extensions', viewName: 'x:MtaExtensions' },
            ],
          },
          { type: 'link', name: 'Sender Authentication', viewName: 'x:SenderAuth' },
        ],
      },
    },
    { link: { name: 'Branding', icon: 'palette', viewName: 'x:Enterprise' } },
    { link: { name: 'Something New', icon: 'sparkles', viewName: 'x:SomethingNew' } },
  ],
};

function tree(items: (LayoutItem | LayoutSubItem)[]): unknown[] {
  return items.map((it) => {
    if ('link' in it) return it.link.name;
    if ('container' in it) return { [it.container.name]: tree(it.container.items) };
    if (it.type === 'link') return it.name;
    return { [`${it.name}${it.advanced ? ' (advanced)' : ''}`]: tree(it.items) };
  });
}

describe('regroupSettings', () => {
  it('puts every page under its category, with plain labels, Overview first', () => {
    expect(tree(regroupSettings(served).items)).toEqual([
      'Overview',
      {
        'Mail flow': [
          { Receiving: ['Sender checks (SPF, DKIM, DMARC)'] },
          { 'Advanced (advanced)': ['Greeting (EHLO)', 'SMTP extensions'] },
        ],
      },
      { System: [{ Server: ['Branding'] }, { Other: ['Something New'] }] },
    ]);
  });

  it('keeps view names, so URLs do not move', () => {
    const out = regroupSettings(served);
    expect(out.items[0]).toEqual({
      link: { name: 'Overview', icon: 'layout-grid', viewName: SETTINGS_OVERVIEW_VIEW },
    });
    const views: string[] = [];
    const walk = (items: (LayoutItem | LayoutSubItem)[]) => {
      for (const it of items) {
        if ('link' in it) views.push(it.link.viewName);
        else if ('container' in it) walk(it.container.items);
        else if (it.type === 'link') views.push(it.viewName);
        else walk(it.items);
      }
    };
    walk(out.items);
    expect(views.sort()).toEqual(
      [
        SETTINGS_OVERVIEW_VIEW,
        'x:Enterprise',
        'x:MtaExtensions',
        'x:MtaStageEhlo',
        'x:SenderAuth',
        'x:SomethingNew',
      ].sort(),
    );
  });

  it('leaves the other layouts alone', () => {
    const management: Layout = { ...served, name: 'Management' };
    expect(regroupSettings(management)).toBe(management);
    const schema = { layouts: [management, served] } as unknown as Schema;
    expect(withRegroupedSettings(schema).layouts[0]).toBe(management);
  });

  it('fits the section bar', () => {
    expect(SETTINGS_CATEGORIES.length + 1).toBeLessThanOrEqual(12);
  });

  it('places each page once', () => {
    const all = SETTINGS_CATEGORIES.flatMap((c) => c.groups.flatMap((g) => g.pages.map((pg) => pg.viewName)));
    expect(new Set(all).size).toBe(all.length);
  });

  it('only features pages its category holds', () => {
    for (const cat of SETTINGS_CATEGORIES) {
      const own = new Set(cat.groups.flatMap((g) => g.pages.map((pg) => pg.viewName)));
      for (const v of cat.popular) expect(own.has(v), `${cat.name}: ${v}`).toBe(true);
    }
  });
});
