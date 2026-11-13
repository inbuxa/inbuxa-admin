/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Schema } from '@/types/schema';
import { DynamicView } from './DynamicView';

// A record view, such as a DMARC report's, explains its fields with the same
// toggletip as the forms, so the explanation opens on a tap (#200).
const schema = {
  objects: {},
  schemas: { Report: { type: 'single', schemaName: 'Report' } },
  fields: {
    Report: {
      properties: {
        policy: {
          description: 'The policy the domain **published**.',
          type: { type: 'string', format: 'string' },
          update: 'immutable',
        },
        note: {
          description: '',
          type: { type: 'string', format: 'string' },
          update: 'immutable',
        },
      },
    },
  },
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [],
} as unknown as Schema;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() =>
    root.render(
      <DynamicView schema={schema} objectName="Report" viewName="Report" data={{ policy: 'reject', note: 'x' }} />,
    ),
  );
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const tip = () => document.body.querySelector('[data-slot="popover-content"]');

describe('DynamicView field help', () => {
  it('gives a described field a help button and none to the others', () => {
    expect(host.querySelectorAll('button[aria-label]')).toHaveLength(1);
  });

  it('opens the description on a tap', () => {
    const button = host.querySelector('button[aria-label]') as HTMLButtonElement;
    expect(tip()).toBeNull();
    act(() => {
      button.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
      button.click();
    });
    expect(tip()?.textContent).toContain('The policy the domain published.');
  });
});
