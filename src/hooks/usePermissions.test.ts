/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import type { Schema } from '@/types/schema';
import { objectChecks } from './usePermissions';

const schema = {
  objects: {
    'x:Domain': { type: 'object', description: '', permissionPrefix: 'sysDomain' },
    'x:Smtp': { type: 'singleton', description: '', permissionPrefix: 'sysSmtp' },
    'x:DomainView': { type: 'view', objectName: 'x:Domain' },
    'x:Loop': { type: 'view', objectName: 'x:DomainView' },
  },
} as unknown as Schema;

const granted = new Set([
  'sysDomainGet',
  'sysDomainCreate',
  'sysDomainDestroy',
  'sysSmtpGet',
  'sysSmtpUpdate',
  'sysSmtpCreate',
  'sysSmtpDestroy',
]);
const can = objectChecks(schema, (prefix, action) => granted.has(`${prefix}${action}`));

describe('objectChecks', () => {
  it('checks the permission of the object a view shows', () => {
    expect(can.canViewObject('x:Domain')).toBe(true);
    expect(can.canViewObject('x:DomainView')).toBe(true);
    expect(can.canUpdateObject('x:DomainView')).toBe(false);
    expect(can.canCreateObject('x:DomainView')).toBe(true);
    expect(can.canDestroyObject('x:Domain')).toBe(true);
  });

  it('never creates or destroys a singleton', () => {
    expect(can.canUpdateObject('x:Smtp')).toBe(true);
    expect(can.canCreateObject('x:Smtp')).toBe(false);
    expect(can.canDestroyObject('x:Smtp')).toBe(false);
  });

  it('allows nothing on unknown views, views of views, or before the schema loads', () => {
    expect(can.canViewObject('x:Nope')).toBe(false);
    expect(can.canViewObject('x:Loop')).toBe(false);
    const none = objectChecks(null, () => true);
    expect([
      none.canViewObject('x:Domain'),
      none.canCreateObject('x:Domain'),
      none.canUpdateObject('x:Domain'),
      none.canDestroyObject('x:Domain'),
    ]).toEqual([false, false, false, false]);
  });
});
