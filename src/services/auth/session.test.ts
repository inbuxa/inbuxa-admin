/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';
import { clearReturnPath, endSession, readReturnPath } from './session';

describe('endSession', () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
  });

  it('signs out, goes to sign-in and keeps the page to come back to', () => {
    window.history.pushState({}, '', '/management/x:Domain?page=2');
    const go = vi.fn();
    endSession(go);
    expect(go).toHaveBeenCalledWith('/login');
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
    expect(readReturnPath()).toBe('/management/x:Domain?page=2');
  });

  it("doesn't come back to the sign-in pages", () => {
    sessionStorage.setItem('inbuxa_admin_return_path', '/stale');
    window.history.pushState({}, '', '/oauth/callback?code=c&state=s');
    endSession(vi.fn());
    expect(readReturnPath()).toBeNull();
  });

  it('is cleared once sign-in has taken it', () => {
    window.history.pushState({}, '', '/settings');
    endSession(vi.fn());
    clearReturnPath();
    expect(readReturnPath()).toBeNull();
  });
});
