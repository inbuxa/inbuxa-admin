/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * What needs a look, gathered from everything the dashboards know: the
 * server's objects, the cluster's leases, the security to-do list and the
 * period's metrics. Each matter carries where you'd deal with it. The list
 * is empty when all is well, and then nothing is shown at all.
 */
import type { TFunction } from 'i18next';
import {
  CircleX,
  FileWarning,
  HardDrive,
  ListX,
  MailWarning,
  RadioTower,
  RotateCw,
  ServerCrash,
  ShieldAlert,
  Timer,
  Unplug,
} from 'lucide-react';
import { LEGACY_PROTOCOLS_VIEW } from '@/features/hardening/LegacyProtocolsBanner';
import type { Metric } from './types/metrics';
import type { ServerFacts } from './serverFacts';
import type { ClusterHealth, UnboundNode } from './clusterHealth';
import type { Attention } from './components/AttentionRail';
import { DMARC_WARNINGS, LATENCIES, TLS_WARNINGS, mean, nearQuota, total, zoneOf } from './commandCenter';

const QUEUE = 'x:QueuedMessage';

export interface AttentionInput {
  t: TFunction;
  /** Whether the viewer may open a view; matters they can't act on are left out. */
  may: (view: string) => boolean;
  facts: ServerFacts | null;
  health: ClusterHealth | null;
  /** inbuxa: nodes with listeners they couldn't open (inbuxa-server#485). */
  unbound?: UnboundNode[];
  critical: number | null;
  /** inbuxa: blocklist and reverse-DNS failures on Domains › Deliverability (DL-18). */
  deliverability?: number | null;
  deliverabilityHref?: string | null;
  /** inbuxa: scheduled reports whose last two runs failed (RP-17). */
  failingReports?: number | null;
  failingReportsHref?: string | null;
  samples: Metric[];
  liveStatus: string;
  nodesHref: string | null;
  /** The Performance page, where the slow stage shows. */
  slowHref: string | null;
  linkOf: (metrics: string[]) => string | null;
}

export function buildAttention({
  t,
  may,
  facts,
  health,
  unbound = [],
  critical,
  deliverability,
  deliverabilityHref,
  failingReports,
  failingReportsHref,
  samples,
  liveStatus,
  nodesHref,
  slowHref,
  linkOf,
}: AttentionInput): Attention[] {
  const retrying = facts?.retrying ?? 0;
  const bounced = facts?.waiting?.reduce((s, w) => s + w.failed, 0) ?? 0;
  const attention: Attention[] = [];
  if (critical)
    attention.push({
      id: 'security',
      severity: 'crit',
      icon: ShieldAlert,
      count: critical,
      title: t('cc.a.security', {
        count: critical,
        defaultValue_one: 'critical security item',
        defaultValue_other: 'critical security items',
      }),
      detail: t('cc.a.securityDetail', 'On the Security to-do list and not yet accepted.'),
      href: `/Settings/${LEGACY_PROTOCOLS_VIEW}`,
    });
  if (deliverability)
    attention.push({
      id: 'deliverability',
      severity: 'crit',
      icon: MailWarning,
      count: deliverability,
      title: t('cc.a.deliverability', {
        count: deliverability,
        defaultValue_one: 'blocklist or reverse-DNS problem',
        defaultValue_other: 'blocklist or reverse-DNS problems',
      }),
      detail: t('cc.a.deliverabilityDetail', 'Other mail servers may refuse mail from this one.'),
      href: deliverabilityHref ?? null,
    });
  if (failingReports)
    attention.push({
      id: 'scheduledReports',
      severity: 'warn',
      icon: MailWarning,
      count: failingReports,
      title: t('cc.a.scheduledReports', {
        count: failingReports,
        defaultValue_one: 'scheduled report keeps failing',
        defaultValue_other: 'scheduled reports keep failing',
      }),
      detail: t('cc.a.scheduledReportsDetail', 'Their last two runs failed; the report page says why.'),
      href: failingReportsHref ?? null,
    });
  if (health && health.unhealthy)
    attention.push({
      id: 'nodes',
      severity: 'crit',
      icon: ServerCrash,
      count: health.unhealthy,
      title: t('cc.a.nodes', {
        count: health.unhealthy,
        defaultValue_one: 'node not responding',
        defaultValue_other: 'nodes not responding',
      }),
      detail: health.silent.map((n) => n.hostname).join(', '),
      href: nodesHref,
    });
  const closed = unbound.reduce((s, n) => s + n.listeners.length, 0);
  if (closed)
    attention.push({
      id: 'listeners',
      severity: 'crit',
      icon: Unplug,
      count: closed,
      title: t('cc.a.listeners', {
        count: closed,
        defaultValue_one: 'listener not open',
        defaultValue_other: 'listeners not open',
      }),
      detail: unbound.map((n) => `${n.hostname}: ${n.listeners.join('; ')}`).join(' · '),
      href: nodesHref,
    });
  if (bounced && may(QUEUE))
    attention.push({
      id: 'bounced',
      severity: 'crit',
      icon: CircleX,
      count: bounced,
      title: t('cc.a.bounced', {
        count: bounced,
        defaultValue_one: 'recipient given up on',
        defaultValue_other: 'recipients given up on',
      }),
      detail: t('cc.a.bouncedDetail', 'Delivery failed for good; the sender gets a bounce.'),
      href: `/Management/${QUEUE}`,
    });
  if (facts?.failedTasks && may('x:Task/TaskFailed'))
    attention.push({
      id: 'tasks',
      severity: 'warn',
      icon: ListX,
      count: facts.failedTasks,
      title: t('cc.a.tasks', {
        count: facts.failedTasks,
        defaultValue_one: 'failed task',
        defaultValue_other: 'failed tasks',
      }),
      detail: t('cc.a.tasksDetail', 'Background work that stopped with an error.'),
      href: '/Management/x:Task/TaskFailed',
    });
  if (retrying && may(QUEUE))
    attention.push({
      id: 'retrying',
      severity: 'warn',
      icon: RotateCw,
      count: retrying,
      title: t('cc.a.retrying', {
        count: retrying,
        defaultValue_one: 'message retrying',
        defaultValue_other: 'messages retrying',
      }),
      detail: t('cc.a.retryingDetail', 'A receiving server turned it away for now.'),
      href: `/Management/${QUEUE}`,
    });
  const full = nearQuota(facts?.storage);
  if (full && may('x:Account/User'))
    attention.push({
      id: 'quota',
      severity: 'warn',
      icon: HardDrive,
      count: full,
      title: t('cc.a.quota', {
        count: full,
        defaultValue_one: 'account near its quota',
        defaultValue_other: 'accounts near their quota',
      }),
      detail: t('cc.a.quotaDetail', 'At 90% or more of their storage; mail may soon be refused.'),
      href: '/Management/x:Account/User',
    });
  const slow = LATENCIES.filter((l) => {
    const ms = mean(samples, [l.metric]);
    return ms !== null && zoneOf(ms, l) === 'slow';
  }).length;
  if (slow)
    attention.push({
      id: 'slow',
      severity: 'warn',
      icon: Timer,
      count: slow,
      title: t('cc.a.slow', {
        count: slow,
        defaultValue_one: 'stage running slow',
        defaultValue_other: 'stages running slow',
      }),
      detail: t('cc.a.slowDetailPage', 'Performance shows which one.'),
      href: slowHref,
    });
  // DMARC and TLS reports are separate matters with separate pages, so each
  // gets its own item (#218). One summed count read as disagreeing with the
  // DMARC reports page, which lists one domain at a time.
  const dmarc = total(samples, DMARC_WARNINGS);
  if (dmarc > 0)
    attention.push({
      id: 'dmarcReports',
      severity: 'warn',
      icon: FileWarning,
      count: dmarc,
      title: t('cc.a.dmarcReports', {
        count: dmarc,
        defaultValue_one: 'DMARC report with warnings',
        defaultValue_other: 'DMARC reports with warnings',
      }),
      detail: t('cc.a.dmarcReportsDetail', 'Received this period, across all your domains.'),
      href: linkOf(DMARC_WARNINGS),
    });
  const tls = total(samples, TLS_WARNINGS);
  if (tls > 0)
    attention.push({
      id: 'tlsReports',
      severity: 'warn',
      icon: FileWarning,
      count: tls,
      title: t('cc.a.tlsReports', {
        count: tls,
        defaultValue_one: 'TLS report with warnings',
        defaultValue_other: 'TLS reports with warnings',
      }),
      detail: t('cc.a.tlsReportsDetail', 'Received this period, across all your domains.'),
      href: linkOf(TLS_WARNINGS),
    });
  if (liveStatus === 'error')
    attention.push({
      id: 'feed',
      severity: 'warn',
      icon: RadioTower,
      title: t('cc.a.feed', 'Live feed unavailable'),
      detail: t('cc.a.feedDetail', 'Counts come from the server’s records; connection meters are dark.'),
    });

  return attention;
}
