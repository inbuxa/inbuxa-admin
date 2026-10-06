/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Copy, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { WizardNote, WizardShell } from '@/components/wizard/WizardShell';
import { cn } from '@/lib/utils';
import { RECORD_GROUPS } from './records';
import { RESOLVER_NAME } from './liveCheck';
import { useRecordChecks } from './useRecordChecks';
import { ProgressRing, StateIcon } from './parts';
import type { DomainInfo } from './ConnectDnsPage';
import { hostLabel, pasteParts, type ZoneRecord } from './zone';

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={label}
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setDone(true);
                setTimeout(() => setDone(false), 1500);
              });
            }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {done ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
        </TooltipTrigger>
        <TooltipContent>{done ? t('dnsCopy.copied', 'Copied') : label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * The by-hand path, for hosts the server can't drive: every record set out
 * the way a host's DNS panel asks for it, a copy button on each part, and a
 * live tick as each one appears in public DNS.
 */
export function CopyStep({
  common,
  domain,
  zoneName,
  records,
  onBack,
  onDone,
}: {
  common: Omit<Parameters<typeof WizardShell>[0], 'children'>;
  domain: DomainInfo;
  zoneName: string;
  records: ZoneRecord[];
  onBack: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { states, checking, lastChecked, check, liveCount, allLive } = useRecordChecks(records, domain.id, false);
  const pct = records.length ? Math.round((liveCount / records.length) * 100) : 0;
  const zoneText = records.map((r) => `${r.name}. IN ${r.type} ${r.value}`).join('\n');

  return (
    <WizardShell
      {...common}
      subtitle={t('dnsCopy.subtitle', 'Add these at your DNS host. Each one ticks green as the internet sees it.')}
      onBack={onBack}
      onNext={onDone}
      nextLabel={allLive ? t('dnsWizard.done', 'Done') : t('dnsCopy.later', 'I’ll finish later')}
      aside={
        <>
          <WizardNote title={t('dnsCopy.howTitle', 'How to add them')}>
            <p>
              {t(
                'dnsCopy.how1',
                'In your DNS host’s panel, add a record for each row: pick the type, paste the name and the value.',
              )}
            </p>
            <p>
              {t(
                'dnsCopy.how2',
                'The name is shown the way most panels want it: “@” means {{zone}} itself. If yours asks for full names, add .{{zone}} to the end.',
                { zone: zoneName },
              )}
            </p>
            <p>
              {t(
                'dnsCopy.how3',
                'Set the TTL to Auto or one hour. If a record with the same name and type exists, replace it.',
              )}
            </p>
          </WizardNote>
          <WizardNote title={t('dnsWizard.howChecked', 'How this is checked')}>
            <p>
              {t(
                'dnsWizard.howCheckedBody',
                'Every few seconds this page asks {{resolver}} for each record, so a green tick means the whole internet can see it.',
                { resolver: RESOLVER_NAME },
              )}
            </p>
          </WizardNote>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-6">
        <ProgressRing pct={pct} done={allLive} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold">
            {allLive
              ? t('dnsWizard.allLive', 'All set. {{domain}} is live.', { domain: domain.name })
              : t('dnsWizard.progress', '{{live}} of {{total}} records are live', {
                  live: liveCount,
                  total: records.length,
                })}
          </h2>
          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
              <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
              {t('dnsWizard.checkNow', 'Check now')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void navigator.clipboard.writeText(zoneText)}
              title={t('dnsCopy.zoneHint', 'For hosts that can import a zone file')}
            >
              <Copy className="h-3.5 w-3.5" />
              {t('dnsCopy.copyZone', 'Copy all as a zone file')}
            </Button>
            {lastChecked &&
              t('dnsWizard.lastChecked', 'Last checked {{time}}', { time: lastChecked.toLocaleTimeString() })}
          </div>
        </div>
      </div>

      {RECORD_GROUPS.map((g) => {
        const rows = records.filter((r) => g.kinds.some((k) => k.kind === r.kind));
        if (rows.length === 0) return null;
        return (
          <section key={g.id} className="space-y-2">
            <div>
              <h3 className="font-medium">{g.title}</h3>
              <p className="text-sm text-muted-foreground">{g.why}</p>
            </div>
            <div className="divide-y rounded-xl border">
              {rows.map((r, i) => {
                const host = hostLabel(r.name, zoneName);
                const { value, priority } = pasteParts(r);
                return (
                  <div
                    key={`${r.name}-${r.type}-${i}`}
                    className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 gap-y-1 px-4 py-3 text-sm sm:grid-cols-[1.25rem_4.5rem_minmax(0,12rem)_minmax(0,1fr)] sm:items-center"
                  >
                    <StateIcon state={states.get(r)} />
                    <span className="flex flex-col font-mono text-xs font-semibold leading-tight">
                      {r.type}
                      {priority && (
                        <span className="font-sans text-[11px] font-normal text-muted-foreground">
                          {t('dnsCopy.priority', 'priority {{p}}', { p: priority })}
                        </span>
                      )}
                    </span>
                    <span className="col-start-2 flex min-w-0 items-center gap-1 sm:col-start-auto">
                      <span className="truncate font-mono text-xs" title={r.name}>
                        {host}
                      </span>
                      <CopyButton text={host} label={t('dnsCopy.copyName', 'Copy name')} />
                    </span>
                    <span className="col-start-2 flex min-w-0 items-center gap-1 sm:col-start-auto">
                      <span className="truncate font-mono text-xs text-muted-foreground" title={value}>
                        {value}
                      </span>
                      <CopyButton text={value} label={t('dnsCopy.copyValue', 'Copy value')} />
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {records.some((r) => states.get(r) === 'different') && (
        <p className="text-xs text-muted-foreground">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-highlight" />
          {t(
            'dnsWizard.differentHelp',
            'An amber mark means that name has a different value right now, often an old record that hasn’t expired from caches yet.',
          )}
        </p>
      )}
    </WizardShell>
  );
}
