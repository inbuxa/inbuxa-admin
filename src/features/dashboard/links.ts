/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Where each number on the dashboard leads: the page where you can act on
 * what it counts. Matched on the metric's name, most specific first; a card
 * or chart takes the link of its first metric that has one.
 */

import { usePermissions } from '@/hooks/usePermissions';

export interface DashLink {
  /** A view name from the server's layout, e.g. x:QueuedMessage. */
  viewName: string;
  /** The layout section the view lives in. */
  section: 'Management' | 'Settings';
  /** Filters applied on arrival, as the list page's own f.* URL filters. */
  filters?: Record<string, string>;
  /** What the link says, in a few words: "Open the queue". */
  label: string;
}

const RULES: [RegExp, DashLink][] = [
  [/^user\.count$/, { viewName: 'x:Account/User', section: 'Management', label: 'See people' }],
  [/^domain\.count$/, { viewName: 'x:Domain', section: 'Management', label: 'See domains' }],
  [/^queue\.count$/, { viewName: 'x:QueuedMessage', section: 'Management', label: 'Open the queue' }],
  [
    /^queue\.message-queued$/,
    { viewName: 'x:Trace/InboundDelivery', section: 'Management', label: 'See deliveries in' },
  ],
  [/^queue\./, { viewName: 'x:Trace/OutboundDelivery', section: 'Management', label: 'See deliveries out' }],
  [/^delivery\./, { viewName: 'x:Trace/OutboundDelivery', section: 'Management', label: 'See deliveries out' }],
  [
    /^smtp\.connection-start$/,
    { viewName: 'x:Trace/InboundDelivery', section: 'Management', label: 'See deliveries in' },
  ],
  [/^security\.|^auth\.failed$/, { viewName: 'x:BlockedIp', section: 'Settings', label: 'See blocked IPs' }],
  [/^message-ingest\.(spam|ham)$/, { viewName: 'x:SpamSettings', section: 'Settings', label: 'Spam filter' }],
  [
    /^incoming-report\.dmarc/,
    { viewName: 'x:DmarcExternalReport', section: 'Management', label: 'Open DMARC reports' },
  ],
  [/^incoming-report\.tls/, { viewName: 'x:TlsExternalReport', section: 'Management', label: 'Open TLS reports' }],
  [/^server\.memory$|^store\./, { viewName: 'x:Log', section: 'Management', label: 'See the logs' }],
  [/^message-ingest\.|^dns\./, { viewName: 'x:Log', section: 'Management', label: 'See the logs' }],
];

export function linkForMetrics(metrics: string[]): DashLink | null {
  for (const m of metrics) {
    const hit = RULES.find(([re]) => re.test(m));
    if (hit) return hit[1];
  }
  return null;
}

/** The address of a link, with its filters as the list page reads them. */
export function hrefFor(link: DashLink): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(link.filters ?? {})) q.set(`f.${k}`, v);
  const qs = q.toString();
  return `/${link.section}/${link.viewName}${qs ? `?${qs}` : ''}`;
}

/** The page a set of metrics leads to, if the viewer may open it. */
export function useDashLink(metrics: string[]): DashLink | null {
  const { canViewObject } = usePermissions();
  const link = linkForMetrics(metrics);
  return link && canViewObject(link.viewName) ? link : null;
}
