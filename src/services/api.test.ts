/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { endSession } = vi.hoisted(() => ({ endSession: vi.fn() }));
vi.mock('./auth/session', () => ({ endSession }));

// Fresh modules per test: the refresh keeps its retry state at module level.
async function load() {
  vi.resetModules();
  const api = await import('./api');
  const { useAuthStore } = await import('@/stores/authStore');
  const { useConnectionStore } = await import('@/stores/connectionStore');
  return { ...api, useAuthStore, useConnectionStore };
}

const fetchMock = vi.fn<typeof fetch>();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  endSession.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('refreshAccessToken', () => {
  it("stays signed in when the server doesn't answer", async () => {
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(refreshAccessToken()).rejects.toThrow('Failed to fetch');
    expect(endSession).not.toHaveBeenCalled();
    expect(useAuthStore.getState().refreshToken).toBe('ref');
    expect(useConnectionStore.getState().unreachable).toBe(true);
  });

  it.each([500, 502, 503, 429])('stays signed in on a %i', async (status) => {
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(new Response('busy', { status }));

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(endSession).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().unreachable).toBe(true);
  });

  it('stays signed in when a proxy answers with a page instead of a token', async () => {
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(new Response('<html>maintenance</html>', { status: 200 }));

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(endSession).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().unreachable).toBe(true);
  });

  it.each([400, 401, 403])('ends the session when the server refuses (%i)', async (status) => {
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, status));

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(endSession).toHaveBeenCalledOnce();
    expect(useConnectionStore.getState().unreachable).toBe(false);
  });

  it('tries again on its own and clears the note once the server answers', async () => {
    vi.useFakeTimers();
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json({ access_token: 'acc2', refresh_token: 'ref2', expires_in: 3600 }));

    await expect(refreshAccessToken()).rejects.toThrow();
    expect(useConnectionStore.getState().unreachable).toBe(true);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(useConnectionStore.getState().unreachable).toBe(false);
    expect(useAuthStore.getState().accessToken).toBe('acc2');
    expect(useAuthStore.getState().refreshToken).toBe('ref2');
  });

  it('stops retrying once signed out', async () => {
    vi.useFakeTimers();
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    await expect(refreshAccessToken()).rejects.toThrow();
    useAuthStore.getState().logout();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(endSession).not.toHaveBeenCalled();
    expect(useConnectionStore.getState().unreachable).toBe(false);
  });
});

describe('apiFetch', () => {
  it('still sends a request with a token that has not run out', async () => {
    const { apiFetch, useAuthStore } = await load();
    // Expiring within the minute, so a refresh is tried first.
    useAuthStore.getState().setTokens('acc', 'ref', 30, 'https://mail.test/token');
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(json({ ok: true }));

    const response = await apiFetch('/jmap/session');
    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[1];
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer acc');
  });

  it("reports the server can't be reached, not a 401, when a refresh gets no answer", async () => {
    const { apiFetch, ApiError, useAuthStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const error = await apiFetch('/jmap/session').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect(error).not.toBeInstanceOf(ApiError);
    expect(endSession).not.toHaveBeenCalled();
  });
});
