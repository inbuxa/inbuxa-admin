/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: one person on the People list, as a card (admin UX roadmap, item
 * 10): initials, name and address, a storage ring, role, groups and since
 * when, and the row's own quick actions. It opens like a row does.
 */

import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { formatSize } from '@/lib/durationFormat';
import { cn } from '@/lib/utils';
import type { Person } from './person';

function StorageRing({ fill }: { fill: number | null }) {
  const r = 15;
  const circumference = 2 * Math.PI * r;
  const tone =
    fill === null
      ? 'text-muted-foreground/40'
      : fill >= 0.9
        ? 'text-destructive'
        : fill >= 0.75
          ? 'text-highlight'
          : 'text-primary';
  return (
    <svg viewBox="0 0 36 36" className="h-9 w-9 shrink-0 -rotate-90" aria-hidden="true">
      <circle cx="18" cy="18" r={r} fill="none" strokeWidth="4" className="stroke-muted" />
      {fill !== null && fill > 0 && (
        <circle
          cx="18"
          cy="18"
          r={r}
          fill="none"
          strokeWidth="4"
          strokeLinecap="round"
          className={cn('stroke-current', tone)}
          strokeDasharray={`${Math.max(fill, 0.02) * circumference} ${circumference}`}
        />
      )}
    </svg>
  );
}

export function PersonCard({
  person,
  selected,
  onToggleSelect,
  onOpen,
  actions,
  badge,
}: {
  person: Person;
  /** Shown only when the list allows mass actions. */
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const storage =
    person.quota === null
      ? t('people.usedNoLimit', '{{used}} used, no limit', { used: formatSize(person.used) })
      : t('people.usedOf', '{{used}} of {{quota}}', { used: formatSize(person.used), quota: formatSize(person.quota) });

  return (
    <article
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        'flex cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected && 'border-primary/60 bg-accent/40',
      )}
    >
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <div className="pt-2.5" onClick={stop}>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={t('people.select', 'Select {{name}}', { name: person.name ?? person.address })}
            />
          </div>
        )}
        <span
          aria-hidden="true"
          style={{ '--h': person.hue } as CSSProperties}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--h)_60%_90%)] text-sm font-semibold text-[hsl(var(--h)_55%_24%)] dark:bg-[hsl(var(--h)_35%_24%)] dark:text-[hsl(var(--h)_70%_86%)]"
        >
          {person.initials}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{person.name ?? person.address}</p>
          {person.name && <p className="truncate text-sm text-muted-foreground">{person.address}</p>}
          {badge}
        </div>
        {actions && (
          <div onClick={stop} onKeyDown={stop}>
            {actions}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <StorageRing fill={person.fill} />
        <div className="min-w-0 text-sm">
          <p className="truncate">{storage}</p>
          {person.fill !== null && (
            <p className="text-xs text-muted-foreground">
              {t('people.percentFull', '{{percent}}% full', { percent: Math.round(person.fill * 100) })}
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {person.role !== 'user' && (
          <span className="rounded-full border px-2 py-0.5 font-medium text-foreground">
            {person.role === 'admin' ? t('hover.roleAdmin', 'Administrator') : t('hover.roleCustom', 'Custom role')}
          </span>
        )}
        {person.groups > 0 && (
          <span>
            {t('people.groups', {
              count: person.groups,
              defaultValue_one: 'In {{count}} group',
              defaultValue_other: 'In {{count}} groups',
            })}
          </span>
        )}
        {person.createdAt && (
          <span>
            {t('people.since', 'Since {{date}}', {
              date: new Date(person.createdAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }),
            })}
          </span>
        )}
      </div>
    </article>
  );
}
