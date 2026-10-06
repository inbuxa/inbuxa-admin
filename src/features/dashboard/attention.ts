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
} from 'lucide-react';
import { LEGACY_PROTOCOLS_VIEW } from '@/features/hardening/LegacyProtocolsBanner';
import type { Metric } from './types/metrics';
import type { ServerFacts } from './serverFacts';
import type { ClusterHealth } from './clusterHealth';
import type { Attention } from './components/AttentionRail';
import { DMARC_WARNINGS, LATENCIES, TLS_WARNINGS, mean, nearQuota, total, zoneOf } from './commandCenter';

const QUEUE = 'x:QueuedMessage';

export interface AttentionInput {
  t: TFunction;
  /** Whether the viewer may open a view; matters they can't act on are left out. */
  may: (view: string) => boolean;
  facts: ServerFacts | null;
  health: ClusterHealth | null;
  critical: number | null;
  /** inbuxa: blocklist and reverse-DNS failures on Domains › Deliverability (DL-18). */
  deliverability?: number | null;
  deliverabilityHref?: string | null;
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
  critical,
  deliverability,
  deliverabilityHref,
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
  const dmarc = total(samples, DMARC_WARNINGS);
  const tls = total(samples, TLS_WARNINGS);
  if (dmarc + tls > 0)
    attention.push({
      id: 'reports',
      severity: 'warn',
      icon: FileWarning,
      count: dmarc + tls,
      title: t('cc.a.reports', {
        count: dmarc + tls,
        defaultValue_one: 'report with warnings',
        defaultValue_other: 'reports with warnings',
      }),
      detail: t('cc.a.reportsDetail', 'Other providers flagged how your mail arrived ({{dmarc}} DMARC, {{tls}} TLS).', {
        dmarc,
        tls,
      }),
      href: linkOf(dmarc ? DMARC_WARNINGS : TLS_WARNINGS),
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
