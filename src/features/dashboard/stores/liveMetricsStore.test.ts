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
