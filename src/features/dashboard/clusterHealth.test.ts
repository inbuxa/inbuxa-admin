/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { minutesSilent, podName, setOf, summarizeNodes, unboundOf, type ClusterNodeRow } from './clusterHealth';

const node = (hostname: string, status: ClusterNodeRow['status'], lastRenewal = '2026-09-25T10:00:00Z') => ({
  hostname,
  status,
  lastRenewal,
  unboundListeners: [] as string[],
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
    ).toEqual({ healthy: 3, unhealthy: 0, silent: [], gone: [] });
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

describe('pods (K-A3)', () => {
  it('reads Kubernetes pod names, and nothing else', () => {
    expect(podName('inbuxa-mta-674c7dffc5-c9bp7')).toEqual({
      group: 'inbuxa-mta',
      pod: '674c7dffc5-c9bp7',
      replicated: true,
    });
    expect(podName('inbuxa-upgrade-fcxxt')).toEqual({ group: 'inbuxa-upgrade', pod: 'fcxxt', replicated: false });
    expect(podName('mx2.example.org')).toBeNull();
    expect(podName('mail')).toBeNull();
    expect(podName('inbuxa-0')).toBeNull(); // a StatefulSet's pod keeps its name
    expect(podName('mail-relay')).toBeNull(); // vowels: a word, not a generated suffix
  });

  // The lab after a few rollouts: five pods renewing, four replaced, and the
  // upgrade hook's pod that ran once.
  const lab = [
    node('inbuxa-core-786fbfd875-wftz8', 'active', '2026-11-20T07:24:47Z'),
    node('inbuxa-front-75d4794556-9nv8k', 'active', '2026-11-20T07:24:45Z'),
    node('inbuxa-front-75d4794556-x7tjq', 'active', '2026-11-20T07:24:49Z'),
    node('inbuxa-mta-674c7dffc5-c9bp7', 'active', '2026-11-20T07:24:45Z'),
    node('inbuxa-mta-674c7dffc5-jj6br', 'active', '2026-11-20T07:24:47Z'),
    node('inbuxa-front-75d4794556-4m47f', 'stale', '2026-11-20T06:49:40Z'),
    node('inbuxa-front-75d4794556-v2zxq', 'stale', '2026-11-20T06:50:03Z'),
    node('inbuxa-mta-674c7dffc5-5f6v9', 'stale', '2026-11-20T06:49:49Z'),
    node('inbuxa-mta-674c7dffc5-9g5nx', 'stale', '2026-11-20T06:50:03Z'),
    node('inbuxa-upgrade-fcxxt', 'stale', '2026-11-20T07:19:22Z'),
  ];

  it('does not count pods a rollout replaced, or a finished Job', () => {
    const health = summarizeNodes(lab);
    expect(health).toMatchObject({ healthy: 5, unhealthy: 0, silent: [] });
    expect(health?.gone.map((n) => n.hostname)).toEqual([
      'inbuxa-upgrade-fcxxt',
      'inbuxa-front-75d4794556-v2zxq',
      'inbuxa-mta-674c7dffc5-9g5nx',
      'inbuxa-mta-674c7dffc5-5f6v9',
      'inbuxa-front-75d4794556-4m47f',
    ]);
  });

  it('counts a role with no pod renewing as down, once', () => {
    const health = summarizeNodes(
      lab.filter((n) => !n.hostname.startsWith('inbuxa-mta-674c7dffc5-') || n.status !== 'active'),
    );
    expect(health).toMatchObject({ healthy: 3, unhealthy: 1 });
    expect(health?.silent.map((n) => n.hostname)).toEqual(['inbuxa-mta-674c7dffc5-9g5nx']);
    expect(health?.gone.map((n) => n.hostname)).toContain('inbuxa-mta-674c7dffc5-5f6v9');
  });

  it('still counts a silent server that is not a pod', () => {
    const health = summarizeNodes([...lab, node('mx2.example.org', 'stale', '2026-11-20T07:00:00Z')]);
    expect(health).toMatchObject({ healthy: 5, unhealthy: 1 });
    expect(health?.silent.map((n) => n.hostname)).toEqual(['mx2.example.org']);
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

describe('unboundOf (inbuxa-server#485)', () => {
  it('lists nodes with listeners not open, a single server included, but not old leases', () => {
    const nodes = [
      { ...node('mx1', 'active'), unboundListeners: ['imaps [::]:993: in use'] },
      node('mx2', 'active'),
      { ...node('old', 'inactive'), unboundListeners: ['smtp [::]:25: gone'] },
    ];
    expect(unboundOf(nodes)).toEqual([{ hostname: 'mx1', listeners: ['imaps [::]:993: in use'] }]);
    expect(unboundOf([nodes[0]])).toHaveLength(1);
  });
});

describe('setOf', () => {
  it('reads a registry set as the server sends it', () => {
    // As a live server answered for a listener held by another process
    const wire = {
      'imaps [::]:12993: Failed to bind to [::]:12993: Address already in use (os error 98); retrying': true,
    };
    expect(setOf(wire)).toEqual([
      'imaps [::]:12993: Failed to bind to [::]:12993: Address already in use (os error 98); retrying',
    ]);
    expect(setOf({})).toEqual([]);
    expect(setOf(undefined)).toEqual([]);
    expect(setOf(['a', 'b'])).toEqual(['a', 'b']);
  });
});
