/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what GET /api/ports/check answers, turned into cells (settings-reorg,
 * Ports). In a cluster each node is tried from the others, over the real
 * network; a single server can only say whether a port is listening.
 */

export interface Probe {
  port: number;
  address: string;
  ok: boolean;
  error?: string;
}

export interface ProbeReport {
  checked_at: number;
  probes: Probe[];
  error?: string;
}

export type ReachabilityAnswer =
  | {
      mode: 'cluster';
      ports: number[];
      intervalSeconds: number;
      nodes: { hostname: string; seenBy: { prober: string; report: ProbeReport | null }[] }[];
    }
  | {
      mode: 'local';
      ports: number[];
      listening: { port: number; address: string; listening: boolean }[];
    };

export type CellState = 'reachable' | 'partly' | 'blocked' | 'pending';

export interface Cell {
  state: CellState;
  /** Who could connect, who couldn't and why, in words. */
  detail: string;
}

function short(hostname: string): string {
  return hostname.split('.')[0];
}

/** One node and port: reachable from every other node, from some, from none, or not tried yet. */
export function cellFor(node: { seenBy: { prober: string; report: ProbeReport | null }[] }, port: number): Cell {
  const ok: string[] = [];
  const failed: string[] = [];
  let tried = 0;
  for (const { prober, report } of node.seenBy) {
    if (!report) continue;
    if (report.error) {
      tried++;
      failed.push(`${short(prober)}: ${report.error}`);
      continue;
    }
    const probes = report.probes.filter((p) => p.port === port);
    if (probes.length === 0) continue;
    tried++;
    // A port counts as reachable from a prober when every address it resolved to answered.
    const bad = probes.filter((p) => !p.ok);
    if (bad.length === 0) ok.push(short(prober));
    else failed.push(`${short(prober)}: ${bad.map((p) => `${p.address} ${p.error ?? 'no answer'}`).join('; ')}`);
  }
  if (tried === 0) return { state: 'pending', detail: 'Not tried yet' };
  const parts = [];
  if (ok.length > 0) parts.push(`Reached from ${ok.join(', ')}`);
  if (failed.length > 0) parts.push(`Not from ${failed.join('; ')}`);
  const state: CellState = failed.length === 0 ? 'reachable' : ok.length === 0 ? 'blocked' : 'partly';
  return { state, detail: parts.join('. ') };
}

/** The oldest check behind the answer, so the page can say how fresh it is. */
export function oldestCheck(answer: ReachabilityAnswer): number | null {
  if (answer.mode !== 'cluster') return null;
  const times = answer.nodes.flatMap((n) => n.seenBy.flatMap((s) => (s.report ? [s.report.checked_at] : [])));
  return times.length > 0 ? Math.min(...times) : null;
}
