/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { useAccountStore } from './accountStore';

const account = () => useAccountStore.getState();

beforeEach(() => account().setAccountInfo([], 'community', 'en'));

describe('accountStore', () => {
  it('keeps the permissions and the locale', () => {
    account().setAccountInfo(['sysAccountGet'], 'community', 'de');
    expect(account()).toMatchObject({ permissions: ['sysAccountGet'], locale: 'de' });
  });

  it.each(['oss', 'community', 'enterprise'] as const)('treats a %s server as having every feature', (edition) => {
    account().setAccountInfo([], edition, 'en');
    expect(account().edition).toBe('enterprise');
  });

  it('answers permission checks from the list', () => {
    account().setAccountInfo(['sysDomainGet', 'sysDomainUpdate', 'impersonate'], 'oss', 'en');
    expect(account().hasPermission('impersonate')).toBe(true);
    expect(account().hasPermission('sysDomainGet')).toBe(true);
    expect(account().hasPermission('sysDomainDestroy')).toBe(false);
    expect(account().hasObjectPermission('sysDomain', 'Update')).toBe(true);
    expect(account().hasObjectPermission('sysDomain', 'Create')).toBe(false);
    expect(account().hasObjectPermission('sysAccount', 'Get')).toBe(false);
  });
});
