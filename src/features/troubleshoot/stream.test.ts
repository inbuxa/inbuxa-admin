/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
vi.mock('@/services/api', () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
  getApiBaseUrl: () => 'https://mail.example',
}));

/** Stands in for the browser's EventSource, so a test can play the server. */
class FakeSource {
  static last: FakeSource | null = null;
  url: string;
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: ((e: { data: string }) => void)[] = [];
  constructor(url: string) {
    this.url = url;
    FakeSource.last = this;
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    if (name === 'event') this.listeners.push(fn);
  }
  close() {
    this.closed = true;
  }
  send(data: unknown) {
    for (const fn of this.listeners) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}
vi.stubGlobal('EventSource', FakeSource);

const { streamDeliveryTrace } = await import('./stream');

const handlers = () => ({ opened: vi.fn(), stages: vi.fn(), failed: vi.fn() });
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  FakeSource.last = null;
  apiFetch.mockReset().mockResolvedValue({ text: async () => 'tok/en' });
});
afterEach(() => vi.useRealTimers());

describe('streamDeliveryTrace', () => {
  it('gets a token, then opens the live stream for the target', async () => {
    const on = handlers();
    streamDeliveryTrace('john@example.org', on);
    await settle();
    expect(apiFetch).toHaveBeenCalledWith('/api/token/delivery');
    expect(FakeSource.last!.url).toBe('https://mail.example/api/live/delivery/john%40example.org?token=tok%2Fen');
    FakeSource.last!.onopen!();
    expect(on.opened).toHaveBeenCalledWith(expect.any(Number));
  });

  it('passes on each batch, and closes once the trace completes', async () => {
    const on = handlers();
    streamDeliveryTrace('example.org', on);
    await settle();
    const source = FakeSource.last!;
    source.send([{ type: 'mxLookupStart', domain: 'example.org' }]);
    expect(source.closed).toBe(false);
    source.send([{ type: 'quitCompleted', elapsed: 1 }, { type: 'completed' }]);
    expect(on.stages).toHaveBeenCalledTimes(2);
    expect(on.stages).toHaveBeenLastCalledWith(
      [{ type: 'quitCompleted', elapsed: 1 }, { type: 'completed' }],
      expect.any(Number),
    );
    expect(source.closed).toBe(true);
    source.onerror!();
    expect(on.failed).not.toHaveBeenCalled();
  });

  it('skips a batch it cannot read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const on = handlers();
    streamDeliveryTrace('example.org', on);
    await settle();
    FakeSource.last!.send('{not json');
    expect(on.stages).not.toHaveBeenCalled();
    expect(on.failed).not.toHaveBeenCalled();
  });

  it('fails as lost when the stream drops', async () => {
    const on = handlers();
    streamDeliveryTrace('example.org', on);
    await settle();
    FakeSource.last!.onerror!();
    expect(on.failed).toHaveBeenCalledWith({ reason: 'lost' });
    expect(FakeSource.last!.closed).toBe(true);
  });

  it('gives up after the timeout', async () => {
    vi.useFakeTimers();
    const on = handlers();
    streamDeliveryTrace('example.org', on);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(on.failed).toHaveBeenCalledWith({ reason: 'timeout' });
    expect(FakeSource.last!.closed).toBe(true);
  });

  it('fails to start when there is no token, with the reason', async () => {
    apiFetch.mockRejectedValueOnce(new Error('HTTP 403'));
    const on = handlers();
    streamDeliveryTrace('example.org', on);
    await settle();
    expect(on.failed).toHaveBeenCalledWith({ reason: 'start', message: 'HTTP 403' });
    expect(FakeSource.last).toBeNull();
  });

  it('opens nothing when closed before the token arrives', async () => {
    const on = handlers();
    const close = streamDeliveryTrace('example.org', on);
    close();
    await settle();
    expect(FakeSource.last).toBeNull();
    expect(on.failed).not.toHaveBeenCalled();
  });

  it('stops listening once closed', async () => {
    const on = handlers();
    const close = streamDeliveryTrace('example.org', on);
    await settle();
    close();
    const source = FakeSource.last!;
    expect(source.closed).toBe(true);
    source.onerror!();
    source.send([{ type: 'mxLookupStart', domain: 'x' }]);
    expect(on.failed).not.toHaveBeenCalled();
    expect(on.stages).not.toHaveBeenCalled();
  });
});
