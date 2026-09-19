/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { cn } from '@/lib/utils';
import type { ServerFacts } from '../serverFacts';
import { hrefFor, type DashLink } from '../links';

interface Phrase {
  text: string;
  link: DashLink;
}

/**
 * The server's state in one sentence. Things that need a look come first
 * and turn it amber; otherwise it says what's there. Every phrase is a link
 * to where you'd deal with it.
 */
export function StatusLine({ facts }: { facts: ServerFacts | null }) {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  if (!facts) return <div className="h-12" aria-hidden />;

  const n = (key: string, count: number, one: string, other: string) =>
    t(key, { count, defaultValue_one: one, defaultValue_other: other });

  const attention: Phrase[] = [];
  if (facts.failedTasks)
    attention.push({
      text: n('status.failedTasks', facts.failedTasks, '{{count}} failed task', '{{count}} failed tasks'),
      link: { viewName: 'x:Task/TaskFailed', section: 'Management', label: '' },
    });
  if (facts.retrying)
    attention.push({
      text: n('status.retrying', facts.retrying, '{{count}} message retrying', '{{count}} messages retrying'),
      link: { viewName: 'x:QueuedMessage', section: 'Management', label: '' },
    });
  const bounced = facts.waiting?.reduce((s, w) => s + w.failed, 0) ?? 0;
  if (bounced)
    attention.push({
      text: n('status.bounced', bounced, '{{count}} recipient failed', '{{count}} recipients failed'),
      link: { viewName: 'x:QueuedMessage', section: 'Management', label: '' },
    });

  const present: Phrase[] = [];
  if (facts.users !== undefined)
    present.push({
      text: n('status.people', facts.users, '{{count}} person', '{{count}} people'),
      link: { viewName: 'x:Account/User', section: 'Management', label: '' },
    });
  if (facts.domains !== undefined)
    present.push({
      text: n('status.domains', facts.domains, '{{count}} domain', '{{count}} domains'),
      link: { viewName: 'x:Domain', section: 'Management', label: '' },
    });
  if (facts.queued !== undefined)
    present.push({
      text: facts.queued
        ? n('status.queued', facts.queued, '{{count}} message waiting to send', '{{count}} messages waiting to send')
        : t('status.queueEmpty', 'nothing waiting to send'),
      link: { viewName: 'x:QueuedMessage', section: 'Management', label: '' },
    });
  if (facts.blockedIps)
    present.push({
      text: n('status.blocked', facts.blockedIps, '{{count}} address blocked', '{{count}} addresses blocked'),
      link: { viewName: 'x:BlockedIp', section: 'Settings', label: '' },
    });

  const needsLook = attention.length > 0;
  const phrases = needsLook ? attention : present;
  const visible = phrases.filter((p) => canViewObject(p.link.viewName));
  if (visible.length === 0) return null;

  const lead = needsLook
    ? n('status.needsLook', attention.length, 'One thing needs a look:', '{{count}} things need a look:')
    : t('status.allGood', 'All good:');

  const list: ReactNode[] = visible.map((p, i) => (
    <Fragment key={p.text}>
      {i > 0 && (i === visible.length - 1 ? t('status.and', ' and ') : ', ')}
      <Link
        to={hrefFor(p.link)}
        className="font-medium text-foreground underline decoration-primary/40 decoration-2 underline-offset-4 transition-colors hover:decoration-primary"
      >
        {p.text}
      </Link>
    </Fragment>
  ));

  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-2xl border px-5 py-3.5 text-[15px]',
        needsLook ? 'border-highlight/40 bg-highlight-soft' : 'border-emerald-500/25 bg-emerald-500/5',
      )}
    >
      {needsLook ? (
        <CircleAlert className="h-5 w-5 shrink-0 text-highlight" />
      ) : (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" />
      )}
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{lead}</span> {list}.
      </p>
    </div>
  );
}
