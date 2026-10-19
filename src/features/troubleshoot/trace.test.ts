/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  byAttempt,
  formatElapsed,
  outcome,
  pairStages,
  stageDetail,
  stageLabel,
  stageSeverity,
  traceReducer,
  type TraceState,
} from './trace';
import type { DeliveryStage } from './types';

/** Fills in the English text, the way i18next does with a default value. */
const t = (_key: string, fallback: string, options?: Record<string, unknown>) =>
  fallback.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(options?.[name]));

const s = (stage: DeliveryStage) => stage;

describe('stageSeverity', () => {
  it.each([
    [{ type: 'mxLookupStart', domain: 'a.org' }, 'pending'],
    [{ type: 'mxLookupSuccess', mxs: [], elapsed: 1 }, 'ok'],
    [{ type: 'mxLookupError', reason: 'x', elapsed: 1 }, 'error'],
    [{ type: 'mtaStsNotFound', elapsed: 1 }, 'warn'],
    [{ type: 'deliveryAttemptStart', hostname: 'mx.a.org' }, 'ok'],
    [{ type: 'daneVerifySuccess' }, 'ok'],
    [{ type: 'quitCompleted', elapsed: 1 }, 'ok'],
    [{ type: 'completed' }, 'ok'],
  ] as [DeliveryStage, string][])('%o is %s', (stage, severity) => {
    expect(stageSeverity(stage)).toBe(severity);
  });
});

describe('pairStages', () => {
  it('replaces each start with how that step ended, in place', () => {
    const paired = pairStages([
      s({ type: 'mxLookupStart', domain: 'a.org' }),
      s({ type: 'mtaStsFetchStart' }),
      s({ type: 'mxLookupSuccess', mxs: [], elapsed: 3 }),
      s({ type: 'mtaStsNotFound', elapsed: 4 }),
      s({ type: 'tlsRptLookupStart' }),
    ]);
    expect(paired.map((e) => e.type)).toEqual(['mxLookupSuccess', 'mtaStsNotFound', 'tlsRptLookupStart']);
  });

  it('keeps an outcome with no start, and each attempt apart', () => {
    const paired = pairStages([
      s({ type: 'deliveryAttemptStart', hostname: 'mx1' }),
      s({ type: 'mtaStsVerifySuccess' }),
      s({ type: 'connectionStart', remoteIp: '1' }),
      s({ type: 'connectionError', reason: 'refused', elapsed: 5 }),
      s({ type: 'deliveryAttemptStart', hostname: 'mx2' }),
      s({ type: 'connectionStart', remoteIp: '2' }),
    ]);
    expect(paired.map((e) => e.type)).toEqual([
      'deliveryAttemptStart',
      'mtaStsVerifySuccess',
      'connectionError',
      'deliveryAttemptStart',
      'connectionStart',
    ]);
  });
});

describe('byAttempt', () => {
  it('groups the steps under the attempt they belong to, with lookups first', () => {
    const lookup = s({ type: 'mxLookupSuccess', mxs: [], elapsed: 1 });
    const a1 = s({ type: 'deliveryAttemptStart', hostname: 'mx1' });
    const c1 = s({ type: 'connectionError', reason: 'x', elapsed: 1 });
    const a2 = s({ type: 'deliveryAttemptStart', hostname: 'mx2' });
    expect(byAttempt([lookup, a1, c1, a2])).toEqual([
      { attempt: null, events: [lookup] },
      { attempt: a1, events: [c1] },
      { attempt: a2, events: [] },
    ]);
    expect(byAttempt([])).toEqual([]);
  });
});

describe('outcome', () => {
  it('counts attempts and calls it delivered once a recipient was accepted', () => {
    expect(
      outcome([
        s({ type: 'deliveryAttemptStart', hostname: 'mx1' }),
        s({ type: 'rcptToSuccess', elapsed: 1 }),
        s({ type: 'quitStart' }),
      ]),
    ).toEqual({ attempts: 1, delivered: true });
    expect(outcome([s({ type: 'quitCompleted', elapsed: 1 })])).toEqual({ attempts: 0, delivered: true });
    expect(
      outcome([
        s({ type: 'deliveryAttemptStart', hostname: 'mx1' }),
        s({ type: 'deliveryAttemptStart', hostname: 'mx2' }),
        s({ type: 'rcptToError', reason: 'no', elapsed: 1 }),
      ]),
    ).toEqual({ attempts: 2, delivered: false });
  });
});

describe('labels', () => {
  it('names each step', () => {
    expect(stageLabel(t, s({ type: 'mxLookupStart', domain: 'a.org' }))).toBe('MX Lookup');
    expect(stageLabel(t, s({ type: 'mtaStsNotFound', elapsed: 1 }))).toBe('MTA-STS Policy Fetch');
    expect(stageLabel(t, s({ type: 'tlsaNotFound', elapsed: 1, reason: '' }))).toBe('TLSA / DANE Lookup');
    expect(stageLabel(t, s({ type: 'ehloSuccess', elapsed: 1 }))).toBe('EHLO');
    expect(stageLabel(t, s({ type: 'rcptToStart' }))).toBe('RCPT TO');
    expect(stageLabel(t, s({ type: 'deliveryAttemptStart', hostname: 'mx.a.org' }))).toBe('Delivery Attempt: mx.a.org');
    expect(stageLabel(t, s({ type: 'completed' }))).toBe('completed');
  });

  it('describes what happened', () => {
    const mxs = [
      { exchanges: ['a', 'b'], preference: 10 },
      { exchanges: ['c'], preference: 20 },
    ];
    expect(stageDetail(t, s({ type: 'mxLookupSuccess', mxs, elapsed: 1 }))).toBe('Resolved 3 MX records');
    expect(stageDetail(t, s({ type: 'mxLookupSuccess', mxs: [mxs[1]], elapsed: 1 }))).toBe('Resolved 1 MX record');
    expect(stageDetail(t, s({ type: 'mxLookupStart', domain: 'a.org' }))).toBe('Looking up MX for a.org');
    expect(stageDetail(t, s({ type: 'tlsRptLookupSuccess', rua: [], elapsed: 1 }))).toBe('Found 0 reporting URIs');
    expect(stageDetail(t, s({ type: 'connectionStart', remoteIp: '192.0.2.1' }))).toBe('Connecting to 192.0.2.1');
    expect(stageDetail(t, s({ type: 'quitCompleted', elapsed: 1 }))).toBe('Session closed');
  });

  it('lists up to three addresses, then counts the rest', () => {
    const ips = (n: number) =>
      ({ type: 'ipLookupSuccess', remoteIps: ['1', '2', '3', '4', '5'].slice(0, n), elapsed: 1 }) as const;
    expect(stageDetail(t, ips(3))).toBe('1, 2, 3');
    expect(stageDetail(t, ips(5))).toBe('1, 2, 3 +2 more');
  });

  it("shows the server's reason for errors, and for a missing TLSA record when it gives one", () => {
    expect(stageDetail(t, s({ type: 'ehloError', reason: '421 busy', elapsed: 1 }))).toBe('421 busy');
    expect(stageDetail(t, s({ type: 'tlsaNotFound', reason: 'NXDOMAIN', elapsed: 1 }))).toBe('NXDOMAIN');
    expect(stageDetail(t, s({ type: 'tlsaNotFound', reason: '', elapsed: 1 }))).toBe('No TLSA record found');
  });

  it('has nothing to add for some steps', () => {
    expect(stageDetail(t, s({ type: 'mtaStsFetchStart' }))).toBeNull();
    expect(stageDetail(t, s({ type: 'deliveryAttemptStart', hostname: 'mx' }))).toBeNull();
  });

  it('shows milliseconds under a second, then seconds', () => {
    expect(formatElapsed(42.4)).toBe('42 ms');
    expect(formatElapsed(999)).toBe('999 ms');
    expect(formatElapsed(1000)).toBe('1.0 s');
    expect(formatElapsed(12_345)).toBe('12.3 s');
  });
});

describe('traceReducer', () => {
  const idle: TraceState = { kind: 'idle' };
  const mx = s({ type: 'mxLookupStart', domain: 'a.org' });
  const ok = s({ type: 'mxLookupSuccess', mxs: [], elapsed: 1 });

  const running = (): TraceState =>
    [
      { type: 'start', target: 'a.org' },
      { type: 'opened', at: 1000 },
    ].reduce(traceReducer as never, idle);

  it('starts, then runs once the stream opens', () => {
    const starting = traceReducer(idle, { type: 'start', target: 'a.org' });
    expect(starting).toEqual({ kind: 'starting', target: 'a.org' });
    expect(traceReducer(starting, { type: 'opened', at: 1000 })).toEqual({
      kind: 'running',
      target: 'a.org',
      startedAt: 1000,
      events: [],
    });
  });

  it('adds each batch of steps', () => {
    let state = traceReducer(running(), { type: 'stages', stages: [mx], at: 2000 });
    state = traceReducer(state, { type: 'stages', stages: [ok], at: 3000 });
    expect(state).toMatchObject({ kind: 'running', events: [mx, ok] });
  });

  it('completes at the completed step, keeping what came before it in the batch', () => {
    const state = traceReducer(running(), {
      type: 'stages',
      stages: [mx, { type: 'completed' }, ok],
      at: 5000,
    });
    expect(state).toEqual({ kind: 'completed', target: 'a.org', startedAt: 1000, completedAt: 5000, events: [mx] });
  });

  it('fails when the stream drops, keeping the steps so far, but not after completing', () => {
    const withSteps = traceReducer(running(), { type: 'stages', stages: [mx], at: 2000 });
    expect(traceReducer(withSteps, { type: 'failed', error: 'lost' })).toEqual({
      kind: 'failed',
      target: 'a.org',
      events: [mx],
      error: 'lost',
    });
    const starting = traceReducer(idle, { type: 'start', target: 'a.org' });
    expect(traceReducer(starting, { type: 'failed', error: 'no token' })).toEqual({
      kind: 'failed',
      target: 'a.org',
      events: [],
      error: 'no token',
    });
    const done = traceReducer(running(), { type: 'stages', stages: [{ type: 'completed' }], at: 2000 });
    expect(traceReducer(done, { type: 'failed', error: 'lost' })).toBe(done);
  });

  it('goes back to the form on reset, from any state', () => {
    expect(traceReducer(running(), { type: 'reset' })).toEqual(idle);
  });

  it('ignores stream events once the trace is no longer live', () => {
    expect(traceReducer(idle, { type: 'opened', at: 1 })).toBe(idle);
    expect(traceReducer(idle, { type: 'stages', stages: [mx], at: 1 })).toBe(idle);
    expect(traceReducer(idle, { type: 'failed', error: 'late' })).toBe(idle);
  });
});
