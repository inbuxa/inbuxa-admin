/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Settings › Security › Security (security to-do list spec). What
 * isn't as it should be, most serious first, each with one action: Fix (one
 * field, undoable from the toast), Review (the setting, with why), or the
 * legacy-protocols switch below. Any item can be accepted with a note,
 * which every administrator then sees. No score, and no "all good" banner:
 * when nothing is to do, the page says nothing about it.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronDown, CircleSlash, Loader2, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import { useAccountStore } from '@/stores/accountStore';
import { toast, useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { ExplainButton } from '@/features/ai/explain/ExplainButton';
import { LegacyProtocolsPage } from '@/features/hardening/LegacyProtocolsPage';
import { HelpPanel } from '@/help/HelpPanel';
import { evaluate, type Item, type Passed, type Severity } from './checks';
import { loadSnapshot } from './load';
import {
  accept,
  AcceptancesUnavailable,
  fetchAcceptances,
  removeAcceptance,
  sortOut,
  type Acceptance,
  type Sorted,
} from './acceptances';

interface Loaded {
  sorted: Sorted;
  passed: Passed[];
  /** Null when the server can't keep acceptances: the page works without Accept. */
  acceptances: Acceptance[] | null;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  critical: 'bg-destructive/10 text-destructive border-destructive/30',
  important: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30',
  good: 'bg-muted text-muted-foreground border-border',
};

async function writePatch(object: string, id: string, patch: Record<string, unknown>) {
  const responses = await jmapRequest([
    [`${object}/set`, { accountId: getAccountId(object), update: { [id]: patch } }, '0'],
  ]);
  const [name, body] = responses[0] ?? [];
  if (name !== `${object}/set`) {
    throw new Error((body as { description?: string } | undefined)?.description ?? 'Request failed');
  }
  const failed = (body as { notUpdated?: Record<string, { description?: string; type?: string }> }).notUpdated?.[id];
  if (failed) throw new Error(failed.description ?? failed.type);
}

function scrollToHardening() {
  document.getElementById('hardening')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SecurityPage() {
  const { t } = useTranslation();
  const { dismiss } = useToast();
  const schema = useSchemaStore((s) => s.schema);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const canAccept = useAccountStore((s) => s.hasPermission('sysSecurityAccept'));
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [showPassed, setShowPassed] = useState(false);

  const defaults = useCallback((object: string, field: string) => schema?.fields[object]?.defaults?.[field], [schema]);

  const load = useCallback(async () => {
    const [snapshot, acceptances] = await Promise.all([
      loadSnapshot(),
      fetchAcceptances().catch((e: unknown) => {
        if (e instanceof AcceptancesUnavailable) return null;
        throw e;
      }),
    ]);
    const { items, passed } = evaluate(snapshot, defaults);
    return { sorted: sortOut(items, acceptances ?? []), passed, acceptances };
  }, [defaults]);

  const refresh = useCallback(async () => {
    try {
      setLoaded(await load());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [load]);

  useEffect(() => {
    let live = true;
    load()
      .then((l) => live && setLoaded(l))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [load]);

  const key = (item: Item) => `${item.check}|${item.subject}`;
  const href = (viewName: string, id?: string) =>
    `/${viewToSection[viewName] ?? 'Settings'}/${viewName}${id ? `/${encodeURIComponent(id)}` : ''}`;

  const fix = async (item: Item) => {
    if (item.action.kind !== 'fix') return;
    const { object, id, patch, undo } = item.action;
    setBusy(key(item));
    try {
      await writePatch(object, id, patch);
      toast({
        title: t('security.fixed', 'Fixed: {{what}}', { what: item.title }),
        duration: 10_000,
        description: (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-1"
            onClick={() => {
              dismiss();
              void writePatch(object, id, undo)
                .then(refresh)
                .catch((e: unknown) =>
                  toast({
                    variant: 'destructive',
                    title: t('security.undoFailed', 'Not undone'),
                    description: String(e),
                  }),
                );
            }}
          >
            {t('security.undo', 'Undo')}
          </Button>
        ),
      });
      await refresh();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('security.fixFailed', 'Not fixed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const doAccept = async (item: Item, replaces?: Acceptance) => {
    setBusy(key(item));
    try {
      await accept(item, note.trim(), replaces);
      setAccepting(null);
      setNote('');
      await refresh();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('security.acceptFailed', 'Not accepted'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const unaccept = async (acceptance: Acceptance) => {
    setBusy(acceptance.id);
    try {
      await removeAcceptance(acceptance);
      await refresh();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('security.removeFailed', 'Not removed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const counts = useMemo(() => {
    const todo = loaded?.sorted.todo ?? [];
    return { all: todo.length, critical: todo.filter((x) => x.item.severity === 'critical').length };
  }, [loaded]);

  const severityLabel: Record<Severity, string> = {
    critical: t('security.critical', 'Critical'),
    important: t('security.important', 'Important'),
    good: t('security.good', 'Good practice'),
  };

  const actions = (item: Item) => (
    <div className="flex flex-wrap items-center gap-2">
      {item.action.kind === 'fix' && (
        <Button type="button" size="sm" onClick={() => void fix(item)} disabled={busy !== null}>
          {busy === key(item) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />}
          {t('security.fix', 'Fix')}
        </Button>
      )}
      {item.action.kind === 'review' && (
        <Button asChild type="button" size="sm" variant="outline">
          <Link to={href(item.action.viewName, item.action.id)}>{t('security.review', 'Review')}</Link>
        </Button>
      )}
      {item.action.kind === 'hardening' && (
        <Button type="button" size="sm" variant="outline" onClick={scrollToHardening}>
          {t('security.toSwitch', 'Go to the switch')}
        </Button>
      )}
      {item.explain && (
        <ExplainButton
          subject={{
            '@type': 'Setting',
            object: item.explain.object,
            id: item.explain.id,
            property: item.explain.field,
          }}
          title={item.title}
        />
      )}
      {loaded?.acceptances !== null && canAccept && accepting !== key(item) && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setAccepting(key(item));
            setNote('');
          }}
        >
          {t('security.accept', 'Accept the risk…')}
        </Button>
      )}
    </div>
  );

  if (error && !loaded) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {error}
      </div>
    );
  }
  if (!loaded) return <LoadingFallback />;

  const { sorted, passed } = loaded;
  const notChecked = passed.filter((p) => p.notChecked);

  return (
    <div className="space-y-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="space-y-1">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-semibold">{t('security.title', 'Security')}</h1>
            <HelpPanel viewName="CustomComponent/LegacyProtocols" title={t('security.title', 'Security')} />
          </div>
          <p className="text-muted-foreground">
            {t(
              'security.subtitle',
              'Settings that leave this server more open than it needs to be, most serious first. Checked when this page opens.',
            )}
          </p>
        </header>

        {counts.all > 0 && (
          <p className="text-sm font-medium">
            {counts.critical > 0
              ? t('security.countsCritical', '{{all}} to do, {{critical}} of them critical', counts)
              : t('security.counts', '{{all}} to do', counts)}
          </p>
        )}

        {sorted.todo.length > 0 && (
          <ul className="space-y-3">
            {sorted.todo.map(({ item, stale }) => (
              <li key={key(item)} className="space-y-3 rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={cn(
                      'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
                      SEVERITY_STYLE[item.severity],
                    )}
                  >
                    {severityLabel[item.severity]}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.why}</p>
                  </div>
                </div>

                {item.action.kind === 'fix' && (
                  <ul className="space-y-0.5 text-sm">
                    {item.action.changes.map((c) => (
                      <li key={c.field}>
                        {c.field}: <span className="text-muted-foreground">{c.from}</span> → {c.to}
                      </li>
                    ))}
                  </ul>
                )}
                {item.action.kind === 'review' && item.action.details && (
                  <dl className="grid gap-1 text-sm sm:grid-cols-[auto_1fr] sm:gap-x-4">
                    {item.action.details.map((d) => (
                      <div key={d.label} className="contents">
                        <dt className="text-muted-foreground">{d.label}</dt>
                        <dd className="break-all font-mono text-xs leading-5">{d.value}</dd>
                      </div>
                    ))}
                  </dl>
                )}

                {stale && (
                  <p className="flex flex-wrap items-center gap-2 text-sm text-amber-700 dark:text-amber-400">
                    {t('security.staleAccepted', 'Accepted earlier for a different value, by {{who}}: “{{note}}”', {
                      who: stale.acceptedBy,
                      note: stale.note,
                    })}
                    {canAccept && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7"
                        disabled={busy !== null}
                        onClick={() => void unaccept(stale)}
                      >
                        {t('security.removeOld', 'Remove the old acceptance')}
                      </Button>
                    )}
                  </p>
                )}

                {actions(item)}

                {accepting === key(item) && (
                  <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
                    <label className="text-sm font-medium" htmlFor={`note-${key(item)}`}>
                      {t('security.noteLabel', 'Why is this accepted?')}
                    </label>
                    <Textarea
                      id={`note-${key(item)}`}
                      value={note}
                      maxLength={500}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder={t('security.notePlaceholder', 'Every administrator will see this note.')}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        disabled={!note.trim() || busy !== null}
                        onClick={() => void doAccept(item, stale)}
                      >
                        {busy === key(item) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        {t('security.acceptConfirm', 'Accept')}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setAccepting(null)}>
                        {t('common.cancel', 'Cancel')}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {sorted.accepted.length > 0 && (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              {t('security.accepted', 'Accepted')}
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {sorted.accepted.map(({ item, acceptance }) => (
                <li key={acceptance.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <CircleSlash className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-sm">“{acceptance.note}”</p>
                    <p className="text-xs text-muted-foreground">
                      {t('security.acceptedBy', '{{who}}, {{when}}', {
                        who: acceptance.acceptedBy,
                        when: new Date(acceptance.acceptedAt).toLocaleString(),
                      })}
                    </p>
                  </div>
                  {canAccept && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy !== null}
                      onClick={() => void unaccept(acceptance)}
                    >
                      {t('security.unaccept', 'Put back on the list')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <button
            type="button"
            onClick={() => setShowPassed((v) => !v)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            aria-expanded={showPassed}
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', !showPassed && '-rotate-90')} />
            {t('security.passed', 'Passed checks ({{count}})', { count: passed.length - notChecked.length })}
            {notChecked.length > 0 &&
              t('security.notCheckedCount', ', {{count}} not checked', { count: notChecked.length })}
          </button>
          {showPassed && (
            <ul className="mt-2 space-y-1 text-sm">
              {passed.map((p) => (
                <li key={p.check} className="flex flex-wrap gap-x-2">
                  <span className={p.notChecked ? 'text-muted-foreground' : ''}>{p.title}</span>
                  {p.notChecked && (
                    <span className="text-muted-foreground">
                      {t('security.notChecked', '— not checked: {{why}}', { why: p.notChecked })}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div id="hardening" className="scroll-mt-20">
        <LegacyProtocolsPage />
      </div>
    </div>
  );
}
