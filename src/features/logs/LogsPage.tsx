/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Logs (inbuxa-admin #229, forum t/308). The server's
 * log entries with their fields split out, filtered by level, component,
 * text and time, followed live, and saved as a file.
 *
 * Entries come from the Log tracer's files on the node that answered. Live
 * mode asks for the newest page every few seconds while the tab is visible;
 * it needs nothing from the server beyond the query the page already makes.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronRight, Download, Loader2, Pause, Play, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PageHeader } from '@/components/common/PageHeader';
import { NoLogTracerNote } from '@/components/lists/NoLogTracerNote';
import { ExplainButton } from '@/features/ai/explain/ExplainButton';
import { useExplainStore } from '@/features/ai/explain/explainStore';
import { pageAbout } from '@/help/texts';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { useSchemaStore } from '@/stores/schemaStore';
import {
  EMPTY_LOG_FILTER,
  LEVELS,
  LogsError,
  PAGE_SIZE,
  collectForExport,
  componentOf,
  isFiltered,
  mergeNewer,
  parseFields,
  queryLogs,
  toJsonLines,
  toText,
  type LogEntry,
  type LogFilterInput,
  type LogLevel,
} from './logs';

/** How often live mode asks for new entries. */
const LIVE_INTERVAL_MS = 5000;
/** The most entries the page keeps while following live. */
const MAX_SHOWN = 1000;
const ANY = '__any__';

type Load = { kind: 'loading' } | { kind: 'ready' } | { kind: 'noTracer' } | { kind: 'error'; message: string };
/** A load, and the filter and Refresh it answers. */
type Keyed = { key: string; load: Load };

function download(name: string, body: string, type: string) {
  const href = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

function localTime(ts: string): string {
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? ts : new Date(ms).toLocaleString();
}

export function LogsPage() {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  // "Explain this" on each entry (ai-explain EX-17)
  const canExplain = useExplainStore((s) => s.available);

  const levelInfo = useMemo(() => {
    const variants = schema?.enums?.TracingLevel ?? [];
    return new Map(variants.map((v) => [v.name, v]));
  }, [schema]);
  const eventLabels = useMemo(() => {
    const variants = schema?.enums?.EventType ?? [];
    return new Map(variants.map((v) => [v.name, v.label]));
  }, [schema]);

  const [draft, setDraft] = useState<LogFilterInput>(EMPTY_LOG_FILTER);
  const [filter, setFilter] = useState<LogFilterInput>(EMPTY_LOG_FILTER);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [loaded, setLoaded] = useState<Keyed>({ key: '', load: { kind: 'loading' } });
  const [more, setMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [live, setLive] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [fetches, setFetches] = useState(0);
  const key = `${fetches}:${JSON.stringify(filter)}`;
  // Until the answer for this filter arrives, the page is loading
  const load: Load = loaded.key === key ? loaded.load : { kind: 'loading' };

  const failure = useCallback(
    (err: unknown): Load =>
      err instanceof LogsError && err.noTracer
        ? { kind: 'noTracer' }
        : { kind: 'error', message: err instanceof Error ? err.message : t('list.unknownError', 'Unknown error') },
    [t],
  );

  // The first page, again whenever the filter changes or Refresh is pressed
  useEffect(() => {
    let cancelled = false;
    queryLogs(filter, null)
      .then((page) => {
        if (cancelled) return;
        setEntries(page);
        setMore(page.length === PAGE_SIZE);
        setOpen(new Set());
        setLoaded({ key, load: { kind: 'ready' } });
      })
      .catch((err) => !cancelled && setLoaded({ key, load: failure(err) }));
    return () => {
      cancelled = true;
    };
  }, [filter, key, failure]);

  // Live: new entries on top while the tab is visible
  useEffect(() => {
    if (!live || load.kind !== 'ready') return;
    let busy = false;
    const timer = window.setInterval(() => {
      if (busy || document.hidden) return;
      busy = true;
      queryLogs(filter, null)
        .then((fresh) => setEntries((shown) => mergeNewer(shown, fresh, MAX_SHOWN)))
        .catch(() => setLive(false))
        .finally(() => {
          busy = false;
        });
    }, LIVE_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [live, load.kind, filter]);

  const older = async () => {
    const last = entries[entries.length - 1];
    if (!last) return;
    setLoadingOlder(true);
    try {
      const page = await queryLogs(filter, last.id);
      setEntries((shown) => [...shown, ...page.filter((e) => !shown.some((s) => s.id === e.id))]);
      setMore(page.length === PAGE_SIZE);
    } catch (err) {
      setLoaded({ key, load: failure(err) });
    } finally {
      setLoadingOlder(false);
    }
  };

  const exportAs = async (format: 'jsonl' | 'log') => {
    setExporting(true);
    try {
      const all = await collectForExport(filter);
      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      if (format === 'jsonl') download(`inbuxa-log-${stamp}.jsonl`, toJsonLines(all), 'application/x-ndjson');
      else download(`inbuxa-log-${stamp}.log`, toText(all), 'text/plain');
      toast({ title: t('logs.exported', 'Saved {{count}} entries', { count: all.length }) });
    } catch (err) {
      toast({
        title: t('logs.exportFailed', 'Couldn’t save the log'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFilter({ ...draft });
  };
  const clear = () => {
    setDraft(EMPTY_LOG_FILTER);
    setFilter(EMPTY_LOG_FILTER);
  };
  const toggle = (id: string) =>
    setOpen((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const levelLabel = (level: LogLevel) => levelInfo.get(level)?.label ?? level;
  const levelBadge = (level: LogLevel) => {
    const color = levelInfo.get(level)?.color;
    return (
      <span
        className="inline-block min-w-[4.5rem] rounded border px-1.5 py-0.5 text-center text-xs font-medium"
        style={color ? { color, borderColor: color } : undefined}
      >
        {levelLabel(level)}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <PageHeader
        icon="scroll-text"
        title={t('logs.title', 'Logs')}
        subtitle={pageAbout('x:Log')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant={live ? 'default' : 'outline'}
              size="sm"
              onClick={() => setLive((v) => !v)}
              disabled={load.kind !== 'ready'}
              aria-pressed={live}
            >
              {live ? <Pause className="mr-1.5 h-4 w-4" /> : <Play className="mr-1.5 h-4 w-4" />}
              {live ? t('logs.pause', 'Pause') : t('logs.live', 'Follow live')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFetches((n) => n + 1)}
              disabled={load.kind === 'loading'}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />
              {t('logs.refresh', 'Refresh')}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={load.kind !== 'ready' || exporting}>
                  {exporting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-1.5 h-4 w-4" />
                  )}
                  {t('logs.export', 'Save as file')}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void exportAs('jsonl')}>
                  {t('logs.exportJson', 'JSON, one entry per line (.jsonl)')}
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportAs('log')}>
                  {t('logs.exportText', 'Plain text (.log)')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />

      <form onSubmit={submit} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-6">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('logs.level', 'Level and above')}</span>
          <Select
            value={draft.level || ANY}
            onValueChange={(v) => setDraft((d) => ({ ...d, level: v === ANY ? '' : (v as LogLevel) }))}
          >
            <SelectTrigger aria-label={t('logs.level', 'Level and above')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>{t('logs.anyLevel', 'Any level')}</SelectItem>
              {LEVELS.map((level) => (
                <SelectItem key={level} value={level}>
                  {levelLabel(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('logs.component', 'Component')}</span>
          <Input
            value={draft.component}
            placeholder={t('logs.componentHint', 'smtp, store, acme…')}
            onChange={(e) => setDraft((d) => ({ ...d, component: e.target.value }))}
          />
        </label>
        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="text-muted-foreground">{t('logs.text', 'Text')}</span>
          <Input value={draft.text} onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('logs.from', 'From')}</span>
          <Input
            type="datetime-local"
            value={draft.from}
            onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('logs.to', 'To')}</span>
          <Input
            type="datetime-local"
            value={draft.to}
            onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
          />
        </label>
        <div className="flex gap-2 lg:col-span-6">
          <Button type="submit" size="sm">
            <Search className="mr-1.5 h-4 w-4" />
            {t('logs.show', 'Show')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={clear}
            disabled={!isFiltered(draft) && !isFiltered(filter)}
          >
            {t('logs.clear', 'Clear')}
          </Button>
          {live && (
            <span className="ml-auto self-center text-xs text-muted-foreground" role="status">
              {t('logs.following', 'Following live: new entries appear at the top.')}
            </span>
          )}
        </div>
      </form>

      {load.kind === 'noTracer' && <NoLogTracerNote />}
      {load.kind === 'error' && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
          {load.message}
        </div>
      )}
      {load.kind === 'loading' && (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('logs.loading', 'Reading the log…')}
        </div>
      )}

      {load.kind === 'ready' && entries.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {isFiltered(filter)
            ? t('logs.noneFiltered', 'No entries match these filters.')
            : t('logs.none', 'No log entries yet.')}
        </div>
      )}

      {load.kind === 'ready' && entries.length > 0 && (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 px-2 py-2" />
                <th className="px-2 py-2 font-medium">{t('logs.colTime', 'Time')}</th>
                <th className="px-2 py-2 font-medium">{t('logs.colLevel', 'Level')}</th>
                <th className="px-2 py-2 font-medium">{t('logs.colEvent', 'Event')}</th>
                <th className="px-2 py-2 font-medium">{t('logs.colDetails', 'Details')}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => {
                const isOpen = open.has(entry.id);
                const fields = parseFields(entry.details);
                return (
                  <Fragment key={entry.id}>
                    <tr
                      className={cn('cursor-pointer border-t align-top hover:bg-muted/40', isOpen && 'bg-muted/30')}
                      onClick={() => toggle(entry.id)}
                    >
                      <td className="px-2 py-1.5">
                        <button
                          type="button"
                          className="text-muted-foreground"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? t('logs.collapse', 'Hide fields') : t('logs.expand', 'Show fields')}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggle(entry.id);
                          }}
                        >
                          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-2 py-1.5 tabular-nums">{localTime(entry.timestamp)}</td>
                      <td className="px-2 py-1.5">{levelBadge(entry.level)}</td>
                      <td className="px-2 py-1.5">
                        <div>{eventLabels.get(entry.event) ?? entry.event}</div>
                        <div className="font-mono text-xs text-muted-foreground">{entry.event}</div>
                      </td>
                      <td className="max-w-[36rem] truncate px-2 py-1.5 font-mono text-xs text-muted-foreground">
                        {entry.details}
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="border-t bg-muted/20">
                        <td />
                        <td colSpan={4} className="space-y-3 px-2 py-3">
                          {fields.length > 0 ? (
                            <dl className="grid grid-cols-[minmax(8rem,max-content)_1fr] gap-x-4 gap-y-1 text-xs">
                              {fields.map((f, i) => (
                                <Fragment key={`${f.key}-${i}`}>
                                  <dt className="font-mono text-muted-foreground">{f.key}</dt>
                                  <dd className="whitespace-pre-wrap break-all font-mono">{f.value}</dd>
                                </Fragment>
                              ))}
                            </dl>
                          ) : (
                            <pre className="whitespace-pre-wrap break-all font-mono text-xs">
                              {entry.details || t('logs.noFields', 'This entry has no fields.')}
                            </pre>
                          )}
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                const component = componentOf(entry.event);
                                setDraft((d) => ({ ...d, component }));
                                setFilter((f) => ({ ...f, component }));
                              }}
                            >
                              {t('logs.onlyComponent', 'Only {{component}}', { component: componentOf(entry.event) })}
                            </Button>
                            {canExplain && (
                              <ExplainButton title={entry.event} subject={{ '@type': 'LogEntry', logId: entry.id }} />
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {load.kind === 'ready' && more && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => void older()} disabled={loadingOlder}>
            {loadingOlder && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t('logs.older', 'Show older entries')}
          </Button>
        </div>
      )}
    </div>
  );
}
