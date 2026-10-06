/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { minutesSilent, summarizeNodes, type ClusterNodeRow } from './clusterHealth';

const node = (hostname: string, status: ClusterNodeRow['status'], lastRenewal = '2026-09-25T10:00:00Z') => ({
  hostname,
  status,
  lastRenewal,
});

describe('summarizeNodes', () => {
  it('is not a cluster with one node', () => {
    expect(summarizeNodes([node('mail.example.org', 'active')])).toBeNull();
    expect(summarizeNodes([])).toBeNull();
  });

  it('counts active nodes as healthy', () => {
    expect(
      summarizeNodes([
        node('mail.example.org', 'active'),
        node('mx2.example.org', 'active'),
        node('mx3.example.org', 'active'),
      ]),
    ).toEqual({ healthy: 3, unhealthy: 0, silent: [] });
  });

  it('names the silent nodes, longest quiet first', () => {
    const health = summarizeNodes([
      node('mail.example.org', 'active'),
      node('mx2.example.org', 'stale', '2026-09-25T09:55:00Z'),
      node('mx3.example.org', 'stale', '2026-09-25T09:10:00Z'),
    ]);
    expect(health).toMatchObject({ healthy: 1, unhealthy: 2 });
    expect(health?.silent.map((n) => n.hostname)).toEqual(['mx3.example.org', 'mx2.example.org']);
  });

  it('leaves out old leases', () => {
    // A node gone for a day is history, not a member: one live node is no cluster.
    expect(summarizeNodes([node('mail.example.org', 'active'), node('old.example.org', 'inactive')])).toBeNull();
    expect(
      summarizeNodes([
        node('mail.example.org', 'active'),
        node('mx2.example.org', 'stale'),
        node('old.example.org', 'inactive'),
      ]),
    ).toMatchObject({ healthy: 1, unhealthy: 1 });
  });
});

describe('minutesSilent', () => {
  it('counts whole minutes since the last renewal', () => {
    const now = Date.parse('2026-09-25T10:07:30Z');
    expect(minutesSilent('2026-09-25T10:00:00Z', now)).toBe(7);
    expect(minutesSilent('2026-09-25T10:08:00Z', now)).toBe(0);
    expect(minutesSilent('', now)).toBeNull();
  });
});
