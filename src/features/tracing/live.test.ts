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

class FakeSource {
  static all: FakeSource[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: ((e: { data: string }) => void)[] = [];
  url: string;
  constructor(url: string) {
    this.url = url;
    FakeSource.all.push(this);
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    if (name === 'trace') this.listeners.push(fn);
  }
  close() {
    this.closed = true;
  }
  send(data: unknown) {
    for (const fn of this.listeners) fn({ data: typeof data === 'string' ? data : JSON.stringify(data) });
  }
}
vi.stubGlobal('EventSource', FakeSource);

const { appendEvents, liveTracingQuery, streamLiveTrace, MAX_EVENTS } = await import('./live');

const ev = (n: number) => ({ event: `e${n}`, timestamp: `t${n}`, keyValues: [] });
const last = () => FakeSource.all.at(-1)!;
const handlers = () => ({ opened: vi.fn(), events: vi.fn(), failed: vi.fn() });

beforeEach(() => {
  FakeSource.all = [];
  apiFetch.mockReset().mockResolvedValue({ text: async () => 'tok' });
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('appendEvents', () => {
  it('keeps the newest events up to the cap, and the first timestamp ever seen', () => {
    let buffer = appendEvents({ events: [], anchor: '' }, [ev(1), ev(2)]);
    expect(buffer).toEqual({ events: [ev(1), ev(2)], anchor: 't1' });
    buffer = appendEvents(
      buffer,
      Array.from({ length: MAX_EVENTS }, (_, i) => ev(i + 3)),
    );
    expect(buffer.events).toHaveLength(MAX_EVENTS);
    expect(buffer.events[0]).toEqual(ev(3));
    expect(buffer.anchor).toBe('t1');
  });
});

describe('liveTracingQuery', () => {
  it('sends the keywords and one parameter per filter, the last value winning', () => {
    expect(
      liveTracingQuery('  smtp  ', [
        { key: 'remoteIp', label: 'Remote IP', value: '1' },
        { key: 'remoteIp', label: 'Remote IP', value: '2' },
        { key: 'domain', label: 'Domain', value: 'a.org' },
      ]),
    ).toBe('filter=smtp&remoteIp=2&domain=a.org');
    expect(liveTracingQuery(' ', [])).toBe('');
  });
});

describe('streamLiveTrace', () => {
  it('opens the stream with a fresh token and passes on each batch', async () => {
    const on = handlers();
    streamLiveTrace('filter=x', on);
    await vi.advanceTimersByTimeAsync(0);
    expect(apiFetch).toHaveBeenCalledWith('/api/token/tracing');
    expect(last().url).toBe('https://mail.example/api/live/tracing?token=tok&filter=x');
    last().onopen!();
    expect(on.opened).toHaveBeenCalled();
    last().send({
      0: {
        event: 'smtp.ehlo',
        timestamp: 't',
        keyValues: { 0: { key: 'domain', value: { '@type': 'String', value: 'a' } } },
      },
    });
    expect(on.events).toHaveBeenCalledWith([
      { event: 'smtp.ehlo', timestamp: 't', keyValues: [{ key: 'domain', value: { '@type': 'String', value: 'a' } }] },
    ]);
  });

  it('skips a batch it cannot read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const on = handlers();
    streamLiveTrace('', on);
    await vi.advanceTimersByTimeAsync(0);
    last().send('{oops');
    expect(on.events).not.toHaveBeenCalled();
  });

  it('reconnects up to five times, two seconds apart, then gives up', async () => {
    const on = handlers();
    streamLiveTrace('', on);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 1; i <= 5; i++) {
      last().onerror!();
      expect(last().closed).toBe(true);
      await vi.advanceTimersByTimeAsync(1999);
      expect(FakeSource.all).toHaveLength(i);
      await vi.advanceTimersByTimeAsync(1);
      expect(FakeSource.all).toHaveLength(i + 1);
    }
    expect(apiFetch).toHaveBeenCalledTimes(1);
    last().onerror!();
    expect(on.failed).toHaveBeenCalledWith({ reason: 'disconnected' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(FakeSource.all).toHaveLength(6);
  });

  it('starts counting again after a reconnect opens', async () => {
    const on = handlers();
    streamLiveTrace('', on);
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 4; i++) {
      last().onerror!();
      await vi.advanceTimersByTimeAsync(2000);
    }
    last().onopen!();
    for (let i = 0; i < 5; i++) {
      last().onerror!();
      await vi.advanceTimersByTimeAsync(2000);
    }
    expect(on.failed).not.toHaveBeenCalled();
  });

  it('fails to start when there is no token', async () => {
    apiFetch.mockRejectedValueOnce(new Error('HTTP 403'));
    const on = handlers();
    streamLiveTrace('', on);
    await vi.advanceTimersByTimeAsync(0);
    expect(on.failed).toHaveBeenCalledWith({ reason: 'start', message: 'HTTP 403' });
  });

  it('stays stopped: no reconnect, no events, nothing opened late', async () => {
    const on = handlers();
    const stop = streamLiveTrace('', on);
    await vi.advanceTimersByTimeAsync(0);
    last().onerror!();
    stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(FakeSource.all).toHaveLength(1);

    const early = streamLiveTrace('', on);
    early();
    await vi.advanceTimersByTimeAsync(0);
    expect(FakeSource.all).toHaveLength(1);
    expect(on.failed).not.toHaveBeenCalled();
  });
});
