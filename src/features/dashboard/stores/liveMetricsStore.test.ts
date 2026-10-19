/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, afterEach, vi } from 'vitest';

const originalHead = document.head.innerHTML;
const seenUrls: string[] = [];

class FakeEventSource {
  url: string;
  constructor(url: string) {
    this.url = url;
    seenUrls.push(url);
  }
  addEventListener() {}
  close() {}
}

async function subscribeWithMeta(meta: string) {
  document.head.innerHTML = meta;
  vi.resetModules();
  vi.stubGlobal('EventSource', FakeEventSource);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('tok123', { status: 200 })),
  );
  const { useLiveMetricsStore } = await import('./liveMetricsStore');
  useLiveMetricsStore.getState().subscribe(new Set(['cpu' as never]));
  await new Promise((r) => setTimeout(r, 300));
  useLiveMetricsStore.getState().unsubscribe();
  return seenUrls.at(-1) ?? '';
}

afterEach(() => {
  document.head.innerHTML = originalHead;
  seenUrls.length = 0;
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('live metrics stream URL', () => {
  it('honors the deploy-time api-base-url instead of the Admin origin', async () => {
    const url = await subscribeWithMeta('<meta name="api-base-url" content="https://mail.example.org" />');
    expect(url.startsWith('https://mail.example.org/api/live/metrics?')).toBe(true);
  });

  it('falls back to the Admin origin when no api-base-url is injected', async () => {
    const url = await subscribeWithMeta('');
    expect(url.startsWith(`${window.location.origin}/api/live/metrics?`)).toBe(true);
  });
});

/** Plays the server for the stream's lifecycle. */
class ScriptedSource {
  static all: ScriptedSource[] = [];
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: ((e: { data: string }) => void)[] = [];
  constructor(url: string) {
    this.url = url;
    ScriptedSource.all.push(this);
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    if (name === 'metrics') this.listeners.push(fn);
  }
  close() {
    this.closed = true;
  }
  send(data: unknown) {
    for (const fn of this.listeners) fn({ data: JSON.stringify(data) });
  }
}

describe('live metrics stream lifecycle', () => {
  async function load() {
    vi.resetModules();
    ScriptedSource.all = [];
    vi.stubGlobal('EventSource', ScriptedSource);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('tok 1', { status: 200 })),
    );
    vi.useFakeTimers();
    const { useLiveMetricsStore } = await import('./liveMetricsStore');
    current = useLiveMetricsStore;
    return useLiveMetricsStore;
  }
  const latest = () => ScriptedSource.all.at(-1)!;

  let current: Awaited<ReturnType<typeof load>> | null = null;
  afterEach(() => {
    current?.getState().unsubscribe();
    current = null;
    vi.useRealTimers();
  });

  it('waits for subscriptions to settle, then streams the metrics every 30 seconds', async () => {
    const store = await load();
    store.getState().subscribe(new Set(['a']));
    store.getState().subscribe(new Set(['a', 'b']));
    await vi.advanceTimersByTimeAsync(199);
    expect(ScriptedSource.all).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(ScriptedSource.all).toHaveLength(1);
    expect(latest().url).toMatch(/\/api\/live\/metrics\?token=tok%201&interval=30&metrics=a%2Cb$/);
    expect(store.getState().status).toBe('connecting');
    latest().onopen!();
    expect(store.getState().status).toBe('open');
  });

  it('keeps the latest sample of each metric', async () => {
    const store = await load();
    store.getState().subscribe(new Set(['a', 'b']));
    await vi.advanceTimersByTimeAsync(200);
    latest().send([
      { '@type': 'Gauge', metric: 'a', count: 1 },
      { '@type': 'Gauge', metric: 'b', count: 2 },
    ]);
    latest().send([{ '@type': 'Gauge', metric: 'a', count: 3 }]);
    expect(Object.fromEntries([...store.getState().snapshot].map(([k, m]) => [k, m.count]))).toEqual({ a: 3, b: 2 });
  });

  it('stays idle for no metrics', async () => {
    const store = await load();
    store.getState().subscribe(new Set());
    await vi.advanceTimersByTimeAsync(200);
    expect(ScriptedSource.all).toHaveLength(0);
    expect(store.getState().status).toBe('idle');
  });

  it('reopens a dropped stream two seconds later, with a fresh token, for as long as it takes', async () => {
    const store = await load();
    store.getState().subscribe(new Set(['a']));
    await vi.advanceTimersByTimeAsync(200);
    for (let i = 1; i <= 8; i++) {
      latest().onerror!();
      expect(latest().closed).toBe(true);
      expect(store.getState().status).toBe('connecting');
      await vi.advanceTimersByTimeAsync(2000);
      expect(ScriptedSource.all).toHaveLength(i + 1);
    }
    expect(fetch).toHaveBeenCalledTimes(9);
    store.getState().unsubscribe();
  });

  it('stops with the reason when it cannot get a token', async () => {
    const store = await load();
    vi.mocked(fetch).mockRejectedValue(new Error('offline'));
    store.getState().subscribe(new Set(['a']));
    await vi.advanceTimersByTimeAsync(200);
    expect(store.getState()).toMatchObject({ status: 'error', error: 'offline' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(ScriptedSource.all).toHaveLength(0);
  });

  it('closes a minute after the tab is hidden and reopens when it is back', async () => {
    const store = await load();
    store.getState().subscribe(new Set(['a']));
    await vi.advanceTimersByTimeAsync(200);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(latest().closed).toBe(true);
    expect(store.getState().status).toBe('closed');
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(ScriptedSource.all).toHaveLength(2);
    hidden.mockRestore();
    store.getState().unsubscribe();
  });

  it('stays open when the tab comes back within the minute', async () => {
    const store = await load();
    store.getState().subscribe(new Set(['a']));
    await vi.advanceTimersByTimeAsync(200);
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(30_000);
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(latest().closed).toBe(false);
    expect(ScriptedSource.all).toHaveLength(1);
    hidden.mockRestore();
    store.getState().unsubscribe();
  });

  it('forgets everything on unsubscribe', async () => {
    const store = await load();
    store.getState().subscribe(new Set(['a']));
    await vi.advanceTimersByTimeAsync(200);
    latest().send([{ '@type': 'Gauge', metric: 'a', count: 1 }]);
    store.getState().unsubscribe();
    expect(latest().closed).toBe(true);
    expect(store.getState()).toMatchObject({ status: 'idle', error: null });
    expect(store.getState().snapshot.size).toBe(0);
    expect(store.getState().subscribedIds.size).toBe(0);
  });
});
