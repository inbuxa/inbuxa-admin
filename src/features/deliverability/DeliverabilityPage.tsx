/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Domains › Deliverability (deliverability spec, DL-17): what other
 * mail servers see when this one sends. The sending nodes first, then the
 * domains, worst finding first, each with one fix. Like the Security page:
 * no score, and no "all good" banner; what passed is folded away.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ChevronDown, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import { useAccountStore } from '@/stores/accountStore';
import { resolveObject } from '@/lib/schemaResolver';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  checkNow,
  DeliverabilityUnavailable,
  fetchReports,
  fetchSettings,
  setDisabledLists,
  type Report,
  type Settings,
} from './api';
import { grade, type Finding, type Fix, type Grade } from './grade';

/** DL-15: a node asked again within this long keeps its report. */
const MIN_INTERVAL_MS = 10 * 60_000;
const POLL_MS = 5_000;
const POLL_FOR_MS = 3 * 60_000;

const GRADE_STYLE: Record<Grade, string> = {
  fail: 'bg-destructive/10 text-destructive border-destructive/30',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  unknown: 'bg-muted text-muted-foreground border-border',
};

interface Loaded {
  reports: Report[];
  settings: Settings;
  /** Domain name → id, for the fix links. */
  domainIds: Map<string, string>;
}

async function domainIds(): Promise<Map<string, string>> {
  const responses = await jmapRequest([
    ['x:Domain/get', { accountId: getAccountId('x:Domain'), ids: null, properties: ['name'] }, '0'],
  ]);
  const [, body] = responses[0] ?? [];
  const list = (body as { list?: { id: string; name: string }[] } | undefined)?.list ?? [];
  return new Map(list.map((d) => [d.name.toLowerCase(), d.id]));
}

export function DeliverabilityPage() {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const canCheck = hasPermission('sysDeliverabilityCheck');
  const canChangeLists = hasPermission('sysDeliverabilityUpdate');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [waiting, setWaiting] = useState<{ id: string; since: string | null; until: number } | null>(null);
  const [showPassed, setShowPassed] = useState(false);
  const [savingList, setSavingList] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async (): Promise<Loaded> => {
    const [reports, settings, ids] = await Promise.all([
      fetchReports(),
      fetchSettings(),
      domainIds().catch(() => new Map<string, string>()),
    ]);
    return { reports, settings, domainIds: ids };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await load();
      setLoaded(next);
      setError(null);
      return next;
    } catch (e) {
      if (e instanceof DeliverabilityUnavailable) setUnavailable(true);
      else setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // DL-15: after Check now, look again until the node's report is newer
  useEffect(() => {
    if (!waiting) return;
    timer.current = setInterval(() => {
      void refresh().then((next) => {
        const mine = next?.reports.find((r) => r.id === waiting.id);
        if (mine && mine.checkedAt !== waiting.since) {
          setWaiting(null);
        } else if (Date.now() > waiting.until) {
          setWaiting(null);
          toast({
            title: t('deliv.stillChecking', 'Still checking'),
            description: t('deliv.stillCheckingWhy', 'The new results will be here when you come back to this page.'),
          });
        }
      });
    }, POLL_MS);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [waiting, refresh, t]);

  const graded = useMemo(
    () => (loaded ? grade(loaded.reports, loaded.settings.lists, (k, d, o) => t(k, d, o)) : null),
    [loaded, t],
  );

  const newest = useMemo(() => {
    const times = loaded?.reports.map((r) => Date.parse(r.checkedAt)).filter((n) => !Number.isNaN(n)) ?? [];
    return times.length ? Math.max(...times) : null;
  }, [loaded]);
  const tooSoon = newest !== null && Date.now() - newest < MIN_INTERVAL_MS;

  const startCheck = async () => {
    try {
      const { id, checkedAt } = await checkNow();
      setWaiting({ id, since: checkedAt, until: Date.now() + POLL_FOR_MS });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('deliv.checkFailed', 'Not started'),
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const toggleList = async (name: string, on: boolean) => {
    if (!loaded) return;
    const off = new Set(loaded.settings.disabledLists);
    if (on) off.delete(name);
    else off.add(name);
    setSavingList(name);
    try {
      await setDisabledLists([...off]);
      await refresh();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('deliv.listSaveFailed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setSavingList(null);
    }
  };

  const viewHref = (viewName: string) => {
    const resolved = schema ? resolveObject(schema, viewName) : null;
    const base = `/${viewToSection[viewName] ?? 'Settings'}/${viewName}`;
    return resolved?.objectType.type === 'singleton' ? `${base}/singleton` : base;
  };

  const fixLink = (fix: Fix) => {
    switch (fix.kind) {
      case 'list':
        return (
          <Button asChild size="sm" variant="outline">
            <a href={fix.url} target="_blank" rel="noopener noreferrer">
              {fix.removal
                ? t('deliv.lookUp', 'Look up and ask for removal')
                : t('deliv.listSite', 'Open the list’s site')}
              <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
            </a>
          </Button>
        );
      case 'domain': {
        const id = loaded?.domainIds.get(fix.domain);
        const section = viewToSection['x:Domain'] ?? 'Management';
        return (
          <Button asChild size="sm" variant="outline">
            <Link to={id ? `/${section}/x:Domain/${encodeURIComponent(id)}` : `/${section}/x:Domain`}>
              {t('deliv.openDomain', 'Open the domain')}
            </Link>
          </Button>
        );
      }
      case 'view':
        return (
          <Button asChild size="sm" variant="outline">
            <Link to={viewHref(fix.viewName)}>{t('deliv.review', 'Review')}</Link>
          </Button>
        );
      case 'elsewhere':
        return (
          <span className="text-xs text-muted-foreground">
            {t('deliv.elsewhere', 'Set with your hosting provider or DNS host, not here.')}
          </span>
        );
    }
  };

  const gradeLabel: Record<Grade, string> = {
    fail: t('deliv.fail', 'Fail'),
    warn: t('deliv.warn', 'Warn'),
    unknown: t('deliv.unknown', "Couldn't check"),
  };

  if (unavailable) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {t('deliv.unavailable', 'This server doesn’t have the deliverability check yet.')}
      </div>
    );
  }
  if (error && !loaded) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {error}
      </div>
    );
  }
  if (!loaded || !graded) return <LoadingFallback />;

  const { reports, settings } = loaded;
  const fails = graded.findings.filter((f) => f.grade === 'fail').length;
  const groups = (scope: 'node' | 'domain') => {
    const map = new Map<string, Finding[]>();
    for (const f of graded.findings.filter((x) => x.scope === scope)) {
      const list = map.get(f.owner);
      if (list) list.push(f);
      else map.set(f.owner, [f]);
    }
    return map;
  };
  const nodeGroups = groups('node');
  const domainGroups = groups('domain');
  const notChecked = graded.passed.filter((p) => p.notChecked);

  const card = (f: Finding) => (
    <li key={f.key} className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium', GRADE_STYLE[f.grade])}>
          {gradeLabel[f.grade]}
        </span>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium">{f.title}</p>
          <p className="text-sm text-muted-foreground">{f.why}</p>
        </div>
      </div>
      {fixLink(f.fix)}
    </li>
  );

  const section = (title: string, map: Map<string, Finding[]>) =>
    map.size > 0 && (
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
        {[...map.entries()].map(([owner, findings]) => (
          <div key={owner} className="space-y-2">
            <h3 className="font-mono text-sm">{owner}</h3>
            <ul className="space-y-3">{findings.map(card)}</ul>
          </div>
        ))}
      </section>
    );

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t('deliv.title', 'Deliverability')}</h1>
          {canCheck && (
            <Button
              type="button"
              size="sm"
              onClick={() => void startCheck()}
              disabled={waiting !== null || tooSoon}
              title={
                tooSoon && newest
                  ? t('deliv.tooSoon', 'Checked at {{time}}; again from {{next}}', {
                      time: new Date(newest).toLocaleTimeString(),
                      next: new Date(newest + MIN_INTERVAL_MS).toLocaleTimeString(),
                    })
                  : undefined
              }
            >
              {waiting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {waiting ? t('deliv.checking', 'Checking…') : t('deliv.checkNow', 'Check now')}
            </Button>
          )}
        </div>
        <p className="text-muted-foreground">
          {t(
            'deliv.subtitle',
            'What other mail servers see when this one sends: blocklists, reverse DNS, SPF, DKIM, DMARC, MTA-STS and certificates. Every sending node checks itself once a day.',
          )}
        </p>
        {reports.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {reports
              .map((r) =>
                t('deliv.checkedOn', '{{node}} checked {{when}}', {
                  node: r.hostname,
                  when: new Date(r.checkedAt).toLocaleString(),
                }),
              )
              .join(' · ')}
          </p>
        )}
      </header>

      {reports.length === 0 && (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {canCheck
            ? t('deliv.neverChecked', 'No node has checked yet. Check now, or wait for the daily check.')
            : t('deliv.neverCheckedTenant', 'Not checked yet. The server checks once a day.')}
        </p>
      )}

      {graded.findings.length > 0 && (
        <p className="text-sm font-medium">
          {fails > 0
            ? t('deliv.countsFail', '{{all}} to look at, {{fails}} failing', {
                all: graded.findings.length,
                fails,
              })
            : t('deliv.counts', '{{all}} to look at', { all: graded.findings.length })}
        </p>
      )}

      {section(t('deliv.nodes', 'Sending addresses'), nodeGroups)}
      {section(t('deliv.domains', 'Domains'), domainGroups)}

      {graded.passed.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            aria-expanded={showPassed}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !showPassed && '-rotate-90')} />
            {t('deliv.passed', 'Passed checks ({{count}})', { count: graded.passed.length - notChecked.length })}
            {notChecked.length > 0 &&
              t('deliv.notCheckedCount', ', {{count}} not checked', { count: notChecked.length })}
          </button>
          {showPassed && (
            <ul className="mt-2 space-y-1 text-sm">
              {graded.passed.map((p) => (
                <li key={p.key} className="flex flex-wrap gap-x-2">
                  <span className="font-mono text-xs text-muted-foreground">{p.owner}</span>
                  <span className={p.notChecked ? 'text-muted-foreground' : ''}>{p.title}</span>
                  {p.notChecked && <span className="text-muted-foreground">— {p.notChecked}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canChangeLists && settings.lists.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('deliv.lists', 'Blocklists asked')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'deliv.listsWhy',
              'Each list sees the addresses and domains it’s asked about, as it would whenever anyone checks mail from this server.',
            )}
          </p>
          <ul className="divide-y rounded-xl border bg-card">
            {settings.lists.map((list) => {
              const on = !settings.disabledLists.includes(list.name);
              return (
                <li key={list.name} className="flex items-start gap-3 px-4 py-3">
                  <Switch
                    id={`list-${list.name}`}
                    checked={on}
                    disabled={savingList !== null}
                    onCheckedChange={(v) => void toggleList(list.name, v)}
                    aria-label={list.name}
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <label htmlFor={`list-${list.name}`} className="text-sm font-medium">
                      {list.name}{' '}
                      <span className="font-normal text-muted-foreground">
                        · {list.scope === 'ip' ? t('deliv.scopeIp', 'addresses') : t('deliv.scopeDomain', 'domains')}
                      </span>
                    </label>
                    {list.note && <p className="text-xs text-muted-foreground">{list.note}</p>}
                  </div>
                  {savingList === list.name && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
