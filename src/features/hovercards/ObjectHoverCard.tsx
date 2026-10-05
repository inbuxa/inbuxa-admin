/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, CircleDashed, Globe, Loader2, MailWarning, UserRound } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { formatSize } from '@/lib/durationFormat';
import { cn } from '@/lib/utils';
import { CARD_OBJECTS, loadCardFacts, type CardFacts, type DomainFacts, type PersonFacts } from './facts';

const KIND_LABEL: Record<string, string> = { mx: 'Mail routing', spf: 'SPF', dkim: 'DKIM', dmarc: 'DMARC' };

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function DomainCard({ f }: { f: DomainFacts }) {
  const { t } = useTranslation();
  const auto = (m: string) => (m === 'Automatic' ? t('hover.automatic', 'Automatic') : t('hover.manual', 'Manual'));
  const live = f.checks.filter((c) => c.live).length;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/15 text-sky-700 dark:text-sky-300">
          <Globe className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{f.name}</p>
          <p className="text-muted-foreground">
            {f.enabled ? t('hover.enabled', 'Receiving mail') : t('hover.disabled', 'Turned off')}
            {f.people !== undefined &&
              ` · ${t('hover.people', { count: f.people, defaultValue_one: '{{count}} person', defaultValue_other: '{{count}} people' })}`}
          </p>
        </div>
      </div>
      {f.checks.length > 0 && (
        <div className="space-y-1.5">
          <p className="font-medium">
            {live === f.checks.length
              ? t('hover.dnsAllLive', 'DNS is in place')
              : t('hover.dnsSome', '{{live}} of {{total}} key records live', { live, total: f.checks.length })}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {f.checks.map((c) => (
              <span
                key={c.kind}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2 py-0.5',
                  c.live
                    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                {c.live ? <CheckCircle2 className="h-3 w-3" /> : <CircleDashed className="h-3 w-3" />}
                {KIND_LABEL[c.kind] ?? c.kind}
              </span>
            ))}
          </div>
        </div>
      )}
      {f.deliverability && (
        <p className="flex items-start gap-1.5 text-destructive">
          <MailWarning className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {f.deliverability}
        </p>
      )}
      <div className="space-y-1 border-t pt-2">
        <Row label={t('hover.dns', 'DNS records')}>{auto(f.dns)}</Row>
        <Row label={t('hover.dkim', 'Signing keys')}>{auto(f.dkim)}</Row>
        <Row label={t('hover.certs', 'Certificates')}>{auto(f.certs)}</Row>
      </div>
    </div>
  );
}

function PersonCard({ f }: { f: PersonFacts }) {
  const { t, i18n } = useTranslation();
  const pct = f.quota ? Math.min(100, Math.round((f.used / f.quota) * 100)) : null;
  const roleLabel =
    f.role === 'Admin'
      ? t('hover.roleAdmin', 'Administrator')
      : f.role === 'Custom'
        ? t('hover.roleCustom', 'Custom role')
        : t('hover.roleUser', 'User');
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/15 text-violet-700 dark:text-violet-300">
          <UserRound className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{f.name ?? f.address}</p>
          {f.name && <p className="truncate text-muted-foreground">{f.address}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t('hover.storage', 'Storage')}</span>
          <span className="font-medium">
            {formatSize(f.used)}
            {f.quota ? ` / ${formatSize(f.quota)}` : ''}
          </span>
        </div>
        {pct !== null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full',
                pct >= 90 ? 'bg-rose-500' : pct >= 75 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
      <div className="space-y-1 border-t pt-2">
        <Row label={t('hover.role', 'Role')}>{roleLabel}</Row>
        {f.groups > 0 && <Row label={t('hover.groups', 'Groups')}>{f.groups}</Row>}
        {f.createdAt && (
          <Row label={t('hover.since', 'Here since')}>
            {new Date(f.createdAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' })}
          </Row>
        )}
      </div>
    </div>
  );
}

function CardBody({ objectName, id }: { objectName: string; id: string }) {
  const { t } = useTranslation();
  const [facts, setFacts] = useState<CardFacts | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadCardFacts(objectName, id).then((f) => {
      if (live) setFacts(f);
    });
    return () => {
      live = false;
    };
  }, [objectName, id]);
  if (facts === undefined)
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t('hover.loading', 'Looking…')}
      </div>
    );
  if (!facts) return <p className="text-muted-foreground">{t('hover.unavailable', 'No details available.')}</p>;
  return facts.kind === 'domain' ? <DomainCard f={facts} /> : <PersonCard f={facts} />;
}

/**
 * A card with the essentials of a domain or person, on hover or focus of its
 * name in a list, so a glance answers "is this one healthy?" without
 * opening it. Other objects render their name unchanged.
 */
export function ObjectHoverCard({ objectName, id, children }: { objectName: string; id: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!CARD_OBJECTS.has(objectName) || !id) return <>{children}</>;
  return (
    <TooltipProvider delayDuration={450}>
      <Tooltip open={open} onOpenChange={setOpen}>
        <TooltipTrigger asChild>
          <span className="cursor-default underline decoration-dotted decoration-muted-foreground/40 underline-offset-4">
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="bottom"
          align="start"
          className="w-72 border bg-popover p-4 text-xs text-popover-foreground shadow-soft"
          onClick={(e) => e.stopPropagation()}
        >
          {open && <CardBody objectName={objectName} id={id} />}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
