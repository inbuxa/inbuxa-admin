/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { pathMatchesView } from './navTree';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

describe('pathMatchesView', () => {
  beforeEach(() => {
    useSchemaStore.setState({
      schema: {
        objects: {
          'x:Metrics': { type: 'singleton' },
          'x:Metrics/CollectorPrometheus': { type: 'view', objectName: 'x:Metrics' },
          'x:Domain': { type: 'object' },
        },
      } as unknown as Schema,
    });
  });

  it('matches the page and its records', () => {
    expect(pathMatchesView('/Settings/x:Metrics', 'Settings', 'x:Metrics')).toBe(true);
    expect(pathMatchesView('/Management/x:Domain/b', 'Management', 'x:Domain')).toBe(true);
    expect(pathMatchesView('/Management/x:Domain/new', 'Management', 'x:Domain')).toBe(true);
  });

  it('does not match a separate page under it', () => {
    const path = '/Settings/x:Metrics/CollectorPrometheus';
    expect(pathMatchesView(path, 'Settings', 'x:Metrics')).toBe(false);
    expect(pathMatchesView(path, 'Settings', 'x:Metrics/CollectorPrometheus')).toBe(true);
  });
});
