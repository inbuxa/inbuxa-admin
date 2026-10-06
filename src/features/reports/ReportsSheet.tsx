/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Mail flow › Reports, what goes out and what comes in, as a few
 * sentences on every report page (settings-reorg, second wave). The six
 * pages keep their own settings (names, subjects, signing) folded below.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import type { JmapSetResponse } from '@/types/jmap';
import { toast } from '@/hooks/use-toast';
import {
  addressSet,
  constant,
  FAILURE_OFF,
  FAILURE_ON,
  failuresTogether,
  frequencyOf,
  FREQUENCIES,
  type Frequency,
} from './values';

const FAILURE_OBJECTS: [string, string][] = [
  ['x:DmarcReportSettings', 'failureSendFrequency'],
  ['x:DkimReportSettings', 'sendFrequency'],
  ['x:SpfReportSettings', 'sendFrequency'],
];

interface State {
  dmarc: Frequency | null;
  tls: Frequency | null;
  failures: 'on' | 'off' | 'mixed';
  reportDomain: string | null;
  inbound: string;
  forward: boolean;
}

interface Loaded {
  state: State;
  domains: string[];
  defaultDomain: string;
}

async function load(): Promise<Loaded> {
  const get = (obj: string, ids: string[] | null, properties: string[], id: string) =>
    [`${obj}/get`, { accountId: getAccountId(obj), ids, properties }, id] as [string, Record<string, unknown>, string];
  const res = await jmapRequest([
    get('x:DmarcReportSettings', ['singleton'], ['aggregateSendFrequency', 'failureSendFrequency'], 'dmarc'),
    get('x:TlsReportSettings', ['singleton'], ['sendFrequency'], 'tls'),
    get('x:DkimReportSettings', ['singleton'], ['sendFrequency'], 'dkim'),
    get('x:SpfReportSettings', ['singleton'], ['sendFrequency'], 'spf'),
    get(
      'x:ReportSettings',
      ['singleton'],
      ['inboundReportAddresses', 'inboundReportForwarding', 'outboundReportDomain'],
      'rs',
    ),
    get('x:Domain', null, ['name'], 'dom'),
    get('x:SystemSettings', ['singleton'], ['defaultDomainId'], 'sys'),
  ]);
  const one = (id: string) =>
    ((res.find(([, , i]) => i === id)?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? [])[0] ?? {};
  const all = (id: string) =>
    (res.find(([, , i]) => i === id)?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? [];
  const dmarc = one('dmarc');
  const rs = one('rs');
  const domains = all('dom');
  const defaultId = one('sys').defaultDomainId as string | undefined;
  return {
    state: {
      dmarc: frequencyOf(dmarc.aggregateSendFrequency),
      tls: frequencyOf(one('tls').sendFrequency),
      failures: failuresTogether([dmarc.failureSendFrequency, one('dkim').sendFrequency, one('spf').sendFrequency]),
      reportDomain: (rs.outboundReportDomain as string | null) ?? null,
      inbound: Object.keys((rs.inboundReportAddresses as Record<string, boolean>) ?? {}).join(', '),
      forward: rs.inboundReportForwarding !== false,
    },
    domains: domains.map((d) => String(d.name)).sort(),
    defaultDomain: String(domains.find((d) => d.id === defaultId)?.name ?? ''),
  };
}

export function ReportsSheet({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysReportSettings', 'Update'));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [draft, setDraft] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((l) => {
        if (!live) return;
        setLoaded(l);
        setDraft(l.state);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const changed = useMemo(() => {
    if (!loaded || !draft) return [] as (keyof State)[];
    return (Object.keys(draft) as (keyof State)[]).filter((k) => draft[k] !== loaded.state[k]);
  }, [loaded, draft]);

  if (!loaded || !draft) return null;

  const set = <K extends keyof State>(k: K, v: State[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const freqLabel: Record<Frequency, string> = {
    hourly: t('reports.hourly', 'every hour'),
    daily: t('reports.daily', 'once a day'),
    weekly: t('reports.weekly', 'once a week'),
    disable: t('reports.never', 'never'),
  };
  const fromDomain = draft.reportDomain ?? loaded.defaultDomain;

  const save = async () => {
    setBusy(true);
    const calls: [string, Record<string, unknown>][] = [];
    const add = (obj: string, patch: Record<string, unknown>) => calls.push([obj, patch]);
    if (changed.includes('dmarc') && draft.dmarc)
      add('x:DmarcReportSettings', { aggregateSendFrequency: constant(draft.dmarc) });
    if (changed.includes('tls') && draft.tls) add('x:TlsReportSettings', { sendFrequency: constant(draft.tls) });
    if (changed.includes('failures') && draft.failures !== 'mixed') {
      const value = constant(draft.failures === 'on' ? FAILURE_ON : FAILURE_OFF);
      for (const [obj, prop] of FAILURE_OBJECTS) {
        const existing = calls.find(([o]) => o === obj);
        if (existing) existing[1][prop] = value;
        else add(obj, { [prop]: value });
      }
    }
    const rs: Record<string, unknown> = {};
    if (changed.includes('reportDomain')) rs.outboundReportDomain = draft.reportDomain;
    if (changed.includes('inbound')) rs.inboundReportAddresses = addressSet(draft.inbound);
    if (changed.includes('forward')) rs.inboundReportForwarding = draft.forward;
    if (Object.keys(rs).length > 0) add('x:ReportSettings', rs);
    try {
      const responses = await jmapRequest(
        calls.map(([obj, patch], i) => [
          `${obj}/set`,
          { accountId: getAccountId(obj), update: { singleton: patch } },
          String(i),
        ]),
      );
      const failed = responses
        .map(([, body]) => (body as unknown as JmapSetResponse).notUpdated?.singleton)
        .filter(Boolean)
        .map((e) => e!.description ?? e!.type);
      if (failed.length > 0) throw new Error(failed.join('; '));
      const fresh = await load();
      setLoaded(fresh);
      setDraft(fresh.state);
      onSaved?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('reports.failed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const freqSelect = (k: 'dmarc' | 'tls') =>
    draft[k] === null ? (
      <span className="font-medium">{t('reports.byRule', 'by a rule on its page')}</span>
    ) : (
      <Select value={draft[k]!} disabled={!canUpdate} onValueChange={(v) => set(k, v as Frequency)}>
        <SelectTrigger className="h-8 w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {FREQUENCIES.map((f) => (
            <SelectItem key={f} value={f}>
              {freqLabel[f]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <FileText className="h-5 w-5 text-primary" />
        <p className="flex-1 font-medium">{t('reports.title', 'Reports, in short')}</p>
        {changed.length > 0 && (
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('reports.save', 'Save changes')}
          </Button>
        )}
      </div>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('reports.outgoing', 'Reports this server sends')}
        </h3>
        <ul className="divide-y text-sm">
          <li className="flex flex-wrap items-center gap-2 py-2">
            <span>
              {t('reports.dmarcSentence', 'Tell other domains how mail claiming to be from them fared here (DMARC)')}
            </span>
            {freqSelect('dmarc')}
          </li>
          <li className="flex flex-wrap items-center gap-2 py-2">
            <span>{t('reports.tlsSentence', 'Tell them whether their mail reached us encrypted (TLS)')}</span>
            {freqSelect('tls')}
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className="min-w-0 flex-1">
              {t(
                'reports.failureSentence',
                'Report each message that fails their checks (DMARC, DKIM, SPF), at most once a day per address',
              )}
              <span className="block text-xs text-muted-foreground">
                {draft.failures === 'mixed'
                  ? t(
                      'reports.mixed',
                      'Set differently on the DMARC, DKIM and SPF pages. Switching here sets all three.',
                    )
                  : t(
                      'reports.privacy',
                      'These include the failing message’s headers, which carry people’s addresses. Most large providers don’t send them.',
                    )}
              </span>
            </span>
            <Switch
              checked={draft.failures === 'on'}
              disabled={!canUpdate}
              onCheckedChange={(v) => set('failures', v ? 'on' : 'off')}
            />
          </li>
          <li className="flex flex-wrap items-center gap-2 py-2">
            <span>{t('reports.fromSentence', 'Send them, and bounce messages, from addresses at')}</span>
            <Select
              value={draft.reportDomain ?? '__default__'}
              disabled={!canUpdate}
              onValueChange={(v) => set('reportDomain', v === '__default__' ? null : v)}
            >
              <SelectTrigger className="h-8 w-auto min-w-56 max-w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">
                  {t('reports.defaultDomain', 'the default domain ({{name}})', { name: loaded.defaultDomain || '—' })}
                </SelectItem>
                {loaded.domains.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="basis-full text-xs text-muted-foreground">
              {t('reports.fromExample', 'For example noreply-dmarc@{{domain}} and MAILER-DAEMON@{{domain}}.', {
                domain: fromDomain || 'example.org',
              })}
            </span>
          </li>
        </ul>
      </section>

      <section className="space-y-1">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('reports.incoming', 'Reports other servers send you')}
        </h3>
        <ul className="divide-y text-sm">
          <li className="flex flex-wrap items-center gap-2 py-2">
            <span>{t('reports.inboundSentence', 'Read reports sent to')}</span>
            <Input
              value={draft.inbound}
              disabled={!canUpdate}
              onChange={(e) => set('inbound', e.target.value)}
              className="h-8 max-w-xs"
              aria-label={t('reports.inboundSentence', 'Read reports sent to')}
            />
            <span>{t('reports.inboundAfter', 'and show them under Management › Reports')}</span>
            <span className="basis-full text-xs text-muted-foreground">
              {t(
                'reports.inboundHint',
                'Separate addresses with commas. * matches any domain: postmaster@* is every domain’s postmaster.',
              )}
            </span>
          </li>
          <li className="flex items-center justify-between gap-2 py-2">
            <span>{t('reports.forwardSentence', 'Then deliver them to that mailbox as well')}</span>
            <Switch checked={draft.forward} disabled={!canUpdate} onCheckedChange={(v) => set('forward', v)} />
          </li>
        </ul>
      </section>
    </div>
  );
}
