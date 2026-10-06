/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * How the cluster's nodes are doing, from the server's own node leases
 * (x:ClusterNode). Every node renews its lease once a minute; the server
 * reports a node it hasn't heard from in three minutes as stale, and one
 * silent for a day as inactive. Healthy means active. Inactive nodes are
 * left out altogether: they're old leases, not members.
 *
 * A server counts as a cluster when more than one node holds a lease. On a
 * single server, or when the viewer can't list nodes, there's nothing here
 * and the dashboard keeps its Server Memory card.
 */
import { useCallback, useEffect, useState } from 'react';
import { getAccountId, jmapRequest } from '@/services/jmap/client';

export type NodeStatus = 'active' | 'stale' | 'inactive';

export interface ClusterNodeRow {
  hostname: string;
  nodeId?: string;
  status: NodeStatus;
  /** When the node last renewed its lease. */
  lastRenewal: string;
}

export interface ClusterHealth {
  healthy: number;
  unhealthy: number;
  /** Nodes that stopped renewing, longest silent first. */
  silent: { hostname: string; lastRenewal: string }[];
}

export function summarizeNodes(nodes: ClusterNodeRow[]): ClusterHealth | null {
  const members = nodes.filter((n) => n.status !== 'inactive');
  if (members.length < 2) return null;
  const silent = members
    .filter((n) => n.status !== 'active')
    .sort((a, b) => a.lastRenewal.localeCompare(b.lastRenewal))
    .map(({ hostname, lastRenewal }) => ({ hostname, lastRenewal }));
  return { healthy: members.length - silent.length, unhealthy: silent.length, silent };
}

/** Whole minutes since a node last renewed its lease, or null if the time can't be read. */
export function minutesSilent(lastRenewal: string, now: number = Date.now()): number | null {
  const t = Date.parse(lastRenewal);
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((now - t) / 60_000));
}

async function fetchNodes(): Promise<ClusterNodeRow[] | null> {
  let accountId: string;
  try {
    accountId = getAccountId('x:ClusterNode');
  } catch {
    return null;
  }
  const responses = await jmapRequest([
    ['x:ClusterNode/query', { accountId }, 'q'],
    [
      'x:ClusterNode/get',
      {
        accountId,
        '#ids': { resultOf: 'q', name: 'x:ClusterNode/query', path: '/ids' },
        properties: ['hostname', 'nodeId', 'status', 'lastRenewal'],
      },
      'g',
    ],
  ]);
  const got = responses.find(([name, , tag]) => tag === 'g' && name !== 'error');
  if (!got) return null;
  const list = ((got[1] as Record<string, unknown>).list as Record<string, unknown>[] | undefined) ?? [];
  return list.map((n) => ({
    hostname: String(n.hostname ?? n.id),
    nodeId: n.nodeId === undefined || n.nodeId === null ? undefined : String(n.nodeId),
    status: String(n.status ?? 'active').toLowerCase() as NodeStatus,
    lastRenewal: String(n.lastRenewal ?? ''),
  }));
}

const REFRESH_MS = 30_000;

export interface ClusterState {
  /** Every lease, inactive ones included, for the node roster. */
  nodes: ClusterNodeRow[];
  health: ClusterHealth;
}

/**
 * The cluster's nodes and their health, refreshed every 30 seconds and
 * whenever `tick` moves. undefined until the first answer; null when this
 * server isn't one node of several, or the viewer can't list nodes.
 */
export function useClusterState(tick = 0) {
  const [state, setState] = useState<ClusterState | null | undefined>(undefined);

  const refresh = useCallback(() => {
    fetchNodes()
      .then((nodes) => {
        const health = nodes ? summarizeNodes(nodes) : null;
        setState(nodes && health ? { nodes, health } : null);
      })
      // A failed refresh keeps the last answer rather than flipping the page back.
      .catch(() => setState((s) => (s === undefined ? null : s)));
  }, []);

  useEffect(() => {
    // Fetching syncs with the server; state lands from the promise, not here.
    const first = setTimeout(refresh, 0);
    const timer = setInterval(refresh, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [refresh, tick]);

  return state;
}
