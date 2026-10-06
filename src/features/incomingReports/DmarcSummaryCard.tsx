/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: at the top of Inbound DMARC Reports (admin UX roadmap, item 6):
 * who sends mail as each of our domains, whether they pass, and spoofing
 * said in plain words. The list of raw reports stays underneath.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ChevronDown, Loader2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { fetchDmarcReports, type DmarcExternalReport } from './api';
import { summarizeDmarc, type DomainSummary, type Source } from './summarize';

/** Sources shown before "Show all". */
const FIRST_SOURCES = 8;

/** Report periods are whole days in UTC; local time would show the day before. */
const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { timeZone: 'UTC' });
const num = (n: number) => n.toLocaleString();

function PolicyBadge({ policy, testing }: { policy: DomainSummary['policy']; testing: boolean }) {
  const { t } = useTranslation();
  const label =
    policy === 'reject'
      ? t('inReports.policyReject', 'Policy: reject')
      : policy === 'quarantine'
        ? t('inReports.policyQuarantine', 'Policy: quarantine')
        : policy === 'none'
          ? t('inReports.policyNone', 'Policy: none')
          : t('inReports.policyUnknown', 'Policy: not reported');
  return (
    <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
      {label}
      {testing && ` · ${t('inReports.policyTesting', 'testing')}`}
    </span>
  );
}

function SourceRow({ source }: { source: Source }) {
  const { t } = useTranslation();
  const failed = source.messages - source.passed;
  const { delivered, quarantined, rejected } = source.failedHandling;
  return (
    <tr className="border-t align-top">
      <td className="py-2 pr-3">
        <span className="font-medium break-all">{source.label}</span>
        {source.provedBy && source.ips.length > 0 && (
          <span className="block text-xs text-muted-foreground break-all">
            {source.ips.slice(0, 3).join(', ')}
            {source.ips.length > 3 &&
              ` ${t('inReports.moreIps', { count: source.ips.length - 3, defaultValue_one: '+{{count}} more', defaultValue_other: '+{{count}} more' })}`}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{num(source.messages)}</td>
      <td className="py-2 pr-3">
        {failed === 0 ? (
          <span className="text-muted-foreground">
            {source.provedBy === 'spf'
              ? t('inReports.passedSpf', 'Passed (SPF)')
              : t('inReports.passedDkim', 'Passed (DKIM)')}
          </span>
        ) : (
          <span className="text-destructive">
            {t('inReports.failed', 'Couldn’t prove it’s you')}
            <span className="block text-xs text-muted-foreground">
              {[
                delivered > 0 && t('inReports.delivered', '{{count}} delivered', { count: delivered }),
                quarantined > 0 && t('inReports.quarantined', '{{count}} to spam', { count: quarantined }),
                rejected > 0 && t('inReports.rejected', '{{count}} rejected', { count: rejected }),
              ]
                .filter(Boolean)
                .join(', ')}
            </span>
          </span>
        )}
      </td>
      <td className="py-2 text-xs text-muted-foreground">{source.reporters.join(', ')}</td>
    </tr>
  );
}

function DomainBlock({ summary }: { summary: DomainSummary }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(summary.failed > 0);
  const [all, setAll] = useState(false);
  const shown = all ? summary.sources : summary.sources.slice(0, FIRST_SOURCES);
  const handling = summary.sources.reduce(
    (acc, s) => ({
      delivered: acc.delivered + s.failedHandling.delivered,
      quarantined: acc.quarantined + s.failedHandling.quarantined,
      rejected: acc.rejected + s.failedHandling.rejected,
    }),
    { delivered: 0, quarantined: 0, rejected: 0 },
  );
  return (
    <div className="rounded-lg border">
      <button
        type="button"
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 p-3 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')} />
        <span className="font-medium">{summary.domain}</span>
        <span className="text-sm text-muted-foreground">
          {t('inReports.passedOf', '{{passed}} of {{messages}} messages passed', {
            passed: num(summary.passed),
            messages: num(summary.messages),
          })}
        </span>
        {summary.failed > 0 && (
          <span className="inline-flex items-center gap-1 text-sm text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" />
            {t('inReports.failedCount', {
              count: summary.failed,
              defaultValue_one: '{{count}} couldn’t prove it’s you',
              defaultValue_other: '{{count}} couldn’t prove it’s you',
            })}
          </span>
        )}
        <span className="ml-auto">
          <PolicyBadge policy={summary.policy} testing={summary.testing} />
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t p-3">
          {summary.failed > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p>
                {t('inReports.spoofed', {
                  count: summary.failed,
                  domain: summary.domain,
                  defaultValue_one:
                    '{{count}} message said it was from {{domain}} but came from a server that couldn’t prove it sends for you. That is someone pretending to be you, or one of your own services that isn’t set up to sign yet.',
                  defaultValue_other:
                    '{{count}} messages said they were from {{domain}} but came from servers that couldn’t prove they send for you. That is someone pretending to be you, or one of your own services that isn’t set up to sign yet.',
                })}
              </p>
              <p className="mt-1 text-muted-foreground">
                {t(
                  'inReports.handled',
                  'Receivers delivered {{delivered}}, sent {{quarantined}} to spam and rejected {{rejected}}.',
                  {
                    delivered: num(handling.delivered),
                    quarantined: num(handling.quarantined),
                    rejected: num(handling.rejected),
                  },
                )}
                {summary.policy === 'none' &&
                  ` ${t(
                    'inReports.policyNoneHint',
                    'Your DMARC policy is “none”, so receivers were asked to deliver them anyway. Once every real sender below passes, change the policy to quarantine or reject.',
                  )}`}
              </p>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full table-fixed text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="w-[38%] pb-1 pr-3 font-normal">{t('inReports.colSender', 'Sent by')}</th>
                  <th className="w-[12%] pb-1 pr-3 text-right font-normal">{t('inReports.colMessages', 'Messages')}</th>
                  <th className="w-[28%] pb-1 pr-3 font-normal">{t('inReports.colResult', 'Result')}</th>
                  <th className="pb-1 font-normal">{t('inReports.colReporters', 'Reported by')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((s) => (
                  <SourceRow key={`${s.provedBy}:${s.label}`} source={s} />
                ))}
              </tbody>
            </table>
          </div>
          {summary.sources.length > FIRST_SOURCES && (
            <Button type="button" variant="ghost" size="sm" onClick={() => setAll((a) => !a)}>
              {all
                ? t('inReports.showFewer', 'Show fewer')
                : t('inReports.showAll', 'Show all {{count}} senders', { count: summary.sources.length })}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            {t('inReports.range', {
              count: summary.reports,
              from: day(summary.from),
              until: day(summary.until),
              defaultValue_one: 'From {{count}} report covering {{from}} to {{until}}.',
              defaultValue_other: 'From {{count}} reports covering {{from}} to {{until}}.',
            })}
          </p>
        </div>
      )}
    </div>
  );
}

export function DmarcSummaryCard() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<DmarcExternalReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchDmarcReports()
      .then((r) => live && setReports(r))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const summaries = useMemo(() => (reports ? summarizeDmarc(reports) : []), [reports]);

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <Users className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <h2 className="font-medium">{t('inReports.title', 'Who sends as your domains')}</h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'inReports.hint',
              'Other mail servers report every message they got with your domain in From, and whether it proved it was really you.',
            )}
          </p>
        </div>
      </div>
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !reports ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : summaries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t(
            'inReports.empty',
            'No reports yet. Large providers send one a day for each domain whose DMARC record asks for them (rua=).',
          )}
        </p>
      ) : (
        <div className="space-y-2">
          {summaries.map((s) => (
            <DomainBlock key={s.domain} summary={s} />
          ))}
        </div>
      )}
    </section>
  );
}
