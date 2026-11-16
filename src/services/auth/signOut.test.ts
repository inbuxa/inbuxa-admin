/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAuthStore } from '@/stores/authStore';

import { signOut } from './signOut';

/*
 * Signing out replaces the page it was done from in the history, so Back
 * afterwards doesn't return to a console page that would only send the
 * reader to sign in again (#215).
 */
describe('signOut', () => {
  const original = window.location;
  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: original });
    useAuthStore.getState().logout();
  });

  it('goes to the sign-in page in place of the current one', () => {
    useAuthStore.getState().setTokens('acc', 'ref', 60, '/token');
    const navigate = vi.fn();
    signOut(navigate);
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true });
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it("replaces the page when it signs out at the provider's end-session endpoint", () => {
    const replace = vi.fn();
    Object.defineProperty(window, 'location', { configurable: true, value: { ...original, replace } });
    useAuthStore.getState().setTokens('acc', 'ref', 60, '/token', 'https://id.example.com/logout');
    const navigate = vi.fn();
    signOut(navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
    expect(String(replace.mock.calls[0][0])).toMatch(/^https:\/\/id\.example\.com\/logout/);
  });
});
