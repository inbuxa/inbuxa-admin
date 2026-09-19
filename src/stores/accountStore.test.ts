/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useAccountStore } from './accountStore';

describe('accountStore', () => {
  beforeEach(() => {
    useAccountStore.setState({
      permissions: [],
      edition: 'community',
      locale: 'en',
    });
  });

  describe('setAccountInfo', () => {
    it('stores permissions, edition, and locale', () => {
      useAccountStore.getState().setAccountInfo(['sysAccountGet', 'sysAccountCreate'], 'enterprise', 'de');

      const state = useAccountStore.getState();
      expect(state.permissions).toEqual(['sysAccountGet', 'sysAccountCreate']);
      expect(state.edition).toBe('enterprise');
      expect(state.locale).toBe('de');
    });

    it('replaces previous values on subsequent calls', () => {
      const { setAccountInfo } = useAccountStore.getState();
      setAccountInfo(['a'], 'enterprise', 'fr');
      setAccountInfo(['b', 'c'], 'oss', 'ja');

      const state = useAccountStore.getState();
      expect(state.permissions).toEqual(['b', 'c']);
      // INBUXA: one edition. A server reporting 'oss' still unlocks everything.
      expect(state.edition).toBe('enterprise');
      expect(state.locale).toBe('ja');
    });

    it('accepts empty permissions array', () => {
      useAccountStore.getState().setAccountInfo([], 'community', 'en');
      expect(useAccountStore.getState().permissions).toEqual([]);
    });
  });

  describe('hasPermission', () => {
    it('returns true when the permission exists', () => {
      useAccountStore.getState().setAccountInfo(['sysAccountGet', 'sysAccountCreate'], 'community', 'en');

      expect(useAccountStore.getState().hasPermission('sysAccountGet')).toBe(true);
    });

    it('returns false when the permission does not exist', () => {
      useAccountStore.getState().setAccountInfo(['sysAccountGet'], 'community', 'en');

      expect(useAccountStore.getState().hasPermission('sysAccountDestroy')).toBe(false);
    });

    it('returns false when permissions are empty', () => {
      expect(useAccountStore.getState().hasPermission('anything')).toBe(false);
    });
  });

  describe('hasObjectPermission', () => {
    it('builds correct permission string from prefix and action', () => {
      useAccountStore.getState().setAccountInfo(['sysAccountGet'], 'community', 'en');

      expect(useAccountStore.getState().hasObjectPermission('sysAccount', 'Get')).toBe(true);
    });

    it('returns false for non-matching action', () => {
      useAccountStore.getState().setAccountInfo(['sysAccountGet'], 'community', 'en');

      expect(useAccountStore.getState().hasObjectPermission('sysAccount', 'Destroy')).toBe(false);
    });

    it('returns false for non-matching prefix', () => {
      useAccountStore.getState().setAccountInfo(['sysAccountGet'], 'community', 'en');

      expect(useAccountStore.getState().hasObjectPermission('sysDomain', 'Get')).toBe(false);
    });

    it('works with all action types', () => {
      useAccountStore.getState().setAccountInfo(['fooCreate', 'fooUpdate', 'fooDestroy', 'fooGet'], 'community', 'en');

      const state = useAccountStore.getState();
      expect(state.hasObjectPermission('foo', 'Create')).toBe(true);
      expect(state.hasObjectPermission('foo', 'Update')).toBe(true);
      expect(state.hasObjectPermission('foo', 'Destroy')).toBe(true);
      expect(state.hasObjectPermission('foo', 'Get')).toBe(true);
    });
  });

  describe('edition', () => {
    it('defaults to community', () => {
      expect(useAccountStore.getState().edition).toBe('community');
    });

    it('can be changed to enterprise', () => {
      useAccountStore.getState().setAccountInfo([], 'enterprise', 'en');
      expect(useAccountStore.getState().edition).toBe('enterprise');
    });

    it('is never oss or community, whatever the server reports (INBUXA: one edition)', () => {
      useAccountStore.getState().setAccountInfo([], 'oss', 'en');
      expect(useAccountStore.getState().edition).toBe('enterprise');
      useAccountStore.getState().setAccountInfo([], 'community', 'en');
      expect(useAccountStore.getState().edition).toBe('enterprise');
    });
  });
});
