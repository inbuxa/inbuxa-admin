/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { IconTile } from '@/components/common/IconTile';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { usePermissions } from '@/hooks/usePermissions';
import { useSchemaStore } from '@/stores/schemaStore';
import { minutesSilent, type ClusterHealth } from '../clusterHealth';

const NODES_VIEW = 'x:ClusterNode';

/**
 * Stands in for Server Memory when the server is one node of a cluster: a
 * single node's memory says little about the whole, and which nodes are up
 * says a lot. Healthy of total, with every silent node named and how long
 * it has been quiet. Links to the node list when the viewer may open it.
 */
export function ClusterHealthCard({ health }: { health: ClusterHealth }) {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  const section = useSchemaStore((s) => s.viewToSection[NODES_VIEW]);
  const href = section && canViewObject(NODES_VIEW) ? `/${section}/${NODES_VIEW}` : null;

  const total = health.healthy + health.unhealthy;
  const allWell = health.unhealthy === 0;

  const quietFor = (lastRenewal: string) => {
    const m = minutesSilent(lastRenewal);
    if (m === null) return t('cluster.quietUnknown', 'not heard from');
    if (m < 60)
      return t('cluster.quietMinutes', {
        count: m,
        defaultValue_one: 'quiet for {{count}} minute',
        defaultValue_other: 'quiet for {{count}} minutes',
      });
    const h = Math.floor(m / 60);
    return t('cluster.quietHours', {
      count: h,
      defaultValue_one: 'quiet for {{count}} hour',
      defaultValue_other: 'quiet for {{count}} hours',
    });
  };

  const body = (
    <Card
      className={cn(
        'h-full transition-all hover:shadow-md',
        !allWell && 'border-highlight/50',
        href &&
          'group-hover:-translate-y-0.5 group-hover:border-primary/50 group-focus-visible:ring-2 group-focus-visible:ring-ring',
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <IconTile name="network" size="sm" />
          <span className="text-sm font-medium text-muted-foreground">{t('cluster.health', 'Cluster Health')}</span>
          {href && (
            <ArrowUpRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/0 transition-colors group-hover:text-primary" />
          )}
        </div>

        <div className="mt-3 font-display text-3xl font-semibold tracking-tight tabular-nums">
          {health.healthy}
          <span className="text-muted-foreground"> / {total}</span>
        </div>

        <div className="mt-1 text-sm text-muted-foreground">
          {t('cluster.healthy', {
            count: health.healthy,
            defaultValue_one: '{{count}} healthy node',
            defaultValue_other: '{{count}} healthy nodes',
          })}
          {' · '}
          <span className={cn(!allWell && 'font-medium text-highlight')}>
            {t('cluster.unhealthy', {
              count: health.unhealthy,
              defaultValue_one: '{{count}} unhealthy',
              defaultValue_other: '{{count}} unhealthy',
            })}
          </span>
        </div>

        {health.silent.length > 0 && (
          <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
            {health.silent.map((n) => (
              <li key={n.hostname} className="truncate">
                <span className="font-mono text-foreground">{n.hostname}</span> {quietFor(n.lastRenewal)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );

  return href ? (
    <Link
      to={href}
      className="group block focus-visible:outline-none"
      aria-label={t('cluster.healthLink', 'Cluster Health: see the nodes')}
    >
      {body}
    </Link>
  ) : (
    body
  );
}
