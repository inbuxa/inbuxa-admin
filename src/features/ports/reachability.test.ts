/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { cellFor, oldestCheck, type ProbeReport } from './reachability';

const report = (probes: [number, string, boolean, string?][], at = 100): ProbeReport => ({
  checked_at: at,
  probes: probes.map(([port, address, ok, error]) => ({ port, address, ok, error })),
});

describe('cellFor', () => {
  it('is reachable when every other node got through', () => {
    const node = {
      seenBy: [
        { prober: 'mx2.inbuxa.com', report: report([[25, '192.0.2.1', true]]) },
        { prober: 'mx3.inbuxa.com', report: report([[25, '192.0.2.1', true]]) },
      ],
    };
    expect(cellFor(node, 25)).toEqual({ state: 'reachable', detail: 'Reached from mx2, mx3' });
  });

  it('names who could not get through, and why', () => {
    const node = {
      seenBy: [
        { prober: 'mx2.inbuxa.com', report: report([[25, '192.0.2.1', true]]) },
        {
          prober: 'mx3.inbuxa.com',
          report: report([
            [25, '192.0.2.1', true],
            [25, '2001:db8::1', false, 'no answer within 5 seconds'],
          ]),
        },
      ],
    };
    expect(cellFor(node, 25)).toEqual({
      state: 'partly',
      detail: 'Reached from mx2. Not from mx3: 2001:db8::1 no answer within 5 seconds',
    });
  });

  it('is blocked from everyone, pending before a first round, and says when a name does not resolve', () => {
    expect(
      cellFor({ seenBy: [{ prober: 'mx2.x', report: report([[587, '192.0.2.1', false, 'Connection refused']]) }] }, 587)
        .state,
    ).toBe('blocked');
    expect(cellFor({ seenBy: [{ prober: 'mx2.x', report: null }] }, 25)).toEqual({
      state: 'pending',
      detail: 'Not tried yet',
    });
    expect(
      cellFor(
        { seenBy: [{ prober: 'mx2.x', report: { checked_at: 1, probes: [], error: 'mail.x doesn’t resolve' } }] },
        25,
      ),
    ).toEqual({ state: 'blocked', detail: 'Not from mx2: mail.x doesn’t resolve' });
  });
});

describe('oldestCheck', () => {
  it('finds the oldest round, and nothing for a single server', () => {
    expect(
      oldestCheck({
        mode: 'cluster',
        ports: [25],
        intervalSeconds: 600,
        nodes: [
          { hostname: 'a', seenBy: [{ prober: 'b', report: report([], 300) }] },
          {
            hostname: 'b',
            seenBy: [
              { prober: 'a', report: report([], 200) },
              { prober: 'c', report: null },
            ],
          },
        ],
      }),
    ).toBe(200);
    expect(oldestCheck({ mode: 'local', ports: [], listening: [] })).toBeNull();
  });
});
