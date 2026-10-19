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

describe('refreshAccessToken, answered', () => {
  it.each([400, 401, 403])('ends the session when the server refuses with a %i', async (status) => {
    const { refreshAccessToken, useAuthStore, useConnectionStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_grant' }, status));

    await expect(refreshAccessToken()).rejects.toThrow(`Token refresh failed: ${status}`);
    expect(endSession).toHaveBeenCalledTimes(1);
    expect(useConnectionStore.getState().unreachable).toBe(false);
  });

  it('keeps the new tokens, and the old refresh token when none comes back', async () => {
    const { refreshAccessToken, useAuthStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(json({ access_token: 'acc2', refresh_token: 'ref2', expires_in: 600 }));
    await refreshAccessToken();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'acc2', refreshToken: 'ref2' });

    fetchMock.mockResolvedValueOnce(json({ access_token: 'acc3', expires_in: 600 }));
    await refreshAccessToken();
    expect(useAuthStore.getState()).toMatchObject({ accessToken: 'acc3', refreshToken: 'ref2' });
    const body = new URLSearchParams(String(fetchMock.mock.calls[1][1]?.body));
    expect(Object.fromEntries(body)).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'ref2' });
  });

  it('shares one refresh between callers that ask at once', async () => {
    const { refreshAccessToken, useAuthStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(json({ access_token: 'acc2', expires_in: 600 }));
    await Promise.all([refreshAccessToken(), refreshAccessToken(), refreshAccessToken()]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('apiFetch, answered', () => {
  it('refreshes once on a 401 and sends the request again with the new token', async () => {
    const { apiFetch, useAuthStore } = await load();
    useAuthStore.getState().setTokens('old', 'ref', 3600, 'https://mail.test/token');
    fetchMock
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(json({ access_token: 'new', expires_in: 600 }))
      .mockResolvedValueOnce(json({ ok: true }));

    expect((await apiFetch('/jmap/session')).status).toBe(200);
    expect(fetchMock.mock.calls[2][0]).toBe(`${window.location.origin}/jmap/session`);
    expect(new Headers(fetchMock.mock.calls[2][1]?.headers).get('Authorization')).toBe('Bearer new');
  });

  it('ends the session on a 401 with nothing to refresh with', async () => {
    const { apiFetch, ApiError } = await load();
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 401 }));
    await expect(apiFetch('/jmap/session')).rejects.toBeInstanceOf(ApiError);
    expect(endSession).toHaveBeenCalledTimes(1);
  });

  it("throws an ApiError carrying the server's JSON, or null", async () => {
    const { apiFetch, useAuthStore } = await load();
    useAuthStore.getState().setTokens('acc', 'ref', 3600, 'https://mail.test/token');
    fetchMock.mockResolvedValueOnce(json({ detail: 'nope' }, 422));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 422, body: { detail: 'nope' } });
    fetchMock.mockResolvedValueOnce(new Response('<html>', { status: 502, statusText: 'Bad Gateway' }));
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 502, statusText: 'Bad Gateway', body: null });
  });
});

describe('getApiBaseUrl', () => {
  afterEach(() => {
    document.head.innerHTML = '';
  });

  it("is the page's api-base-url without a trailing slash, else the console's origin", async () => {
    const { getApiBaseUrl } = await load();
    expect(getApiBaseUrl()).toBe(window.location.origin);
    document.head.innerHTML = '<meta name="api-base-url" content=" https://mail.example.org// " />';
    expect(getApiBaseUrl()).toBe('https://mail.example.org');
  });
});
