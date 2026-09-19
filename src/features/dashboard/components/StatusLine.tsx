/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CircleAlert } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import type { ServerFacts } from '../serverFacts';
import { hrefFor, type DashLink } from '../links';

interface Phrase {
  text: string;
  link: DashLink;
}

/**
 * What needs a look, in one sentence: failed tasks, messages retrying,
 * recipients given up on. Nothing shows while all is well. Every phrase is
 * a link to where you'd deal with it.
 */
export function StatusLine({ facts }: { facts: ServerFacts | null }) {
  const { t } = useTranslation();
  const { canViewObject } = usePermissions();
  if (!facts) return null;

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

  // Quiet when all is well: the line only appears when something needs a look.
  const visible = attention.filter((p) => canViewObject(p.link.viewName));
  if (visible.length === 0) return null;

  const lead = n('status.needsLook', visible.length, 'One thing needs a look:', '{{count}} things need a look:');

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
    <div className="flex items-center gap-3 rounded-2xl border border-highlight/40 bg-highlight-soft px-5 py-3.5 text-[15px]">
      <CircleAlert className="h-5 w-5 shrink-0 text-highlight" />
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">{lead}</span> {list}.
      </p>
    </div>
  );
}
