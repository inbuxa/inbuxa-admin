/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what every list card shares: a mark, the name and a line under
 * it, the row's own quick actions, selection, and opening like a row does.
 */

import type { CSSProperties, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Checkbox } from '@/components/ui/checkbox';
import { formatSize } from '@/lib/durationFormat';
import { cn } from '@/lib/utils';

/** Initials on a circle whose hue follows the name, the same every time. */
export function InitialsMark({ initials, hue }: { initials: string; hue: number }) {
  return (
    <span
      aria-hidden="true"
      style={{ '--h': hue } as CSSProperties}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--h)_60%_90%)] text-sm font-semibold text-[hsl(var(--h)_55%_24%)] dark:bg-[hsl(var(--h)_35%_24%)] dark:text-[hsl(var(--h)_70%_86%)]"
    >
      {initials}
    </span>
  );
}

/** An icon on a tinted square, for things that aren't people. */
export function IconMark({ children, className }: { children: ReactNode; className: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', className)}
    >
      {children}
    </span>
  );
}

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

/** Storage used, against the limit when there is one. */
export function StorageSummary({ used, quota, fill }: { used: number; quota: number | null; fill: number | null }) {
  const { t } = useTranslation();
  const storage =
    quota === null
      ? t('people.usedNoLimit', '{{used}} used, no limit', { used: formatSize(used) })
      : t('people.usedOf', '{{used}} of {{quota}}', { used: formatSize(used), quota: formatSize(quota) });
  return (
    <div className="flex items-center gap-3">
      <StorageRing fill={fill} />
      <div className="min-w-0 text-sm">
        <p className="truncate">{storage}</p>
        {fill !== null && (
          <p className="text-xs text-muted-foreground">
            {t('people.percentFull', '{{percent}}% full', { percent: Math.round(fill * 100) })}
          </p>
        )}
      </div>
    </div>
  );
}

/** A small rounded label in the card's footer. */
export function Pill({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'good' | 'muted' | 'bad' }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 font-medium',
        tone === 'plain' && 'border text-foreground',
        tone === 'good' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
        tone === 'muted' && 'bg-muted text-muted-foreground',
        tone === 'bad' && 'bg-destructive/15 text-destructive',
      )}
    >
      {children}
    </span>
  );
}

export function CardShell({
  mark,
  title,
  subtitle,
  badge,
  selected,
  onToggleSelect,
  onOpen,
  actions,
  children,
}: {
  mark: ReactNode;
  title: string;
  subtitle?: ReactNode;
  badge?: ReactNode;
  /** Shown only when the list allows mass actions. */
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
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
        'flex min-w-0 cursor-pointer flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft transition-colors hover:border-primary/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        selected && 'border-primary/60 bg-accent/40',
      )}
    >
      <div className="flex items-start gap-3">
        {onToggleSelect && (
          <div className="pt-2.5" onClick={stop}>
            <Checkbox
              checked={selected}
              onCheckedChange={onToggleSelect}
              aria-label={t('people.select', 'Select {{name}}', { name: title })}
            />
          </div>
        )}
        {mark}
        <div className={cn('min-w-0 flex-1', !subtitle && !badge && 'self-center')}>
          <p className="truncate font-medium">{title}</p>
          {subtitle && <p className="truncate text-sm text-muted-foreground">{subtitle}</p>}
          {/* A list's badges sit beside the name; here they go under it */}
          {badge && <div className="mt-1 [&>*]:ml-0">{badge}</div>}
        </div>
        {actions && (
          <div onClick={stop} onKeyDown={stop}>
            {actions}
          </div>
        )}
      </div>
      {children}
    </article>
  );
}
