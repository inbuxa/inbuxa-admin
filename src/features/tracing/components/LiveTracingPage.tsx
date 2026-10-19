/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Play, Plus, RotateCcw, Square, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { liveEventSubject } from '@/features/ai/explain/explain';
import { useSchemaStore } from '@/stores/schemaStore';
import { appendEvents, liveTracingQuery, MAX_EVENTS, streamLiveTrace, type KeyFilter, type LiveBuffer } from '../live';
import { TraceTimeline } from './TraceTimeline';

type Live =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'streaming'; buffer: LiveBuffer }
  | { kind: 'stopped'; buffer: LiveBuffer }
  /** Failed; the events so far stay on screen, timed from the first of them. */
  | { kind: 'failed'; buffer: LiveBuffer; error: string };

const EMPTY: LiveBuffer = { events: [], anchor: '' };

/** One live stream at a time; it stops when the page goes away. */
function useLiveTrace() {
  const { t } = useTranslation();
  const [live, setLive] = useState<Live>({ kind: 'idle' });
  const stopStream = useRef<(() => void) | null>(null);

  const halt = useCallback(() => {
    stopStream.current?.();
    stopStream.current = null;
  }, []);
  useEffect(() => halt, [halt]);

  const start = useCallback(
    (keywords: string, filters: KeyFilter[]) => {
      halt();
      setLive({ kind: 'starting' });
      const bufferOf = (l: Live) => (l.kind === 'idle' || l.kind === 'starting' ? EMPTY : l.buffer);
      stopStream.current = streamLiveTrace(liveTracingQuery(keywords, filters), {
        opened: () => setLive((l) => ({ kind: 'streaming', buffer: bufferOf(l) })),
        events: (batch) => setLive((l) => ({ kind: 'streaming', buffer: appendEvents(bufferOf(l), batch) })),
        failed: (f) =>
          setLive((l) => ({
            kind: 'failed',
            buffer: { events: bufferOf(l).events, anchor: '' },
            error:
              f.reason === 'disconnected'
                ? t('tracing.liveDisconnected', 'Live tracing stream disconnected after multiple retries.')
                : (f.message ?? t('tracing.liveFailedStart', 'Failed to start live tracing.')),
          })),
      });
    },
    [halt, t],
  );

  const stop = useCallback(() => {
    halt();
    setLive((l) => (l.kind === 'streaming' ? { kind: 'stopped', buffer: l.buffer } : l));
  }, [halt]);

  const reset = useCallback(() => {
    halt();
    setLive({ kind: 'idle' });
  }, [halt]);

  return { live, start, stop, reset };
}

export function LiveTracingPage() {
  const { t } = useTranslation();
  const { live, start, stop, reset } = useLiveTrace();
  const [keywords, setKeywords] = useState('');
  const [filters, setFilters] = useState<KeyFilter[]>([]);

  if (live.kind === 'idle' || live.kind === 'starting') {
    return (
      <TracingForm
        keywords={keywords}
        onKeywords={setKeywords}
        filters={filters}
        onFilters={setFilters}
        starting={live.kind === 'starting'}
        onStart={() => start(keywords, filters)}
      />
    );
  }

  const { events, anchor } = live.buffer;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('tracing.liveTitle', 'Live Tracing')}</h2>
          {live.kind === 'streaming' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('tracing.streamingEvents', 'Streaming events...')}
            </div>
          )}
          {live.kind === 'stopped' && (
            <span className="text-sm text-muted-foreground">{t('tracing.stopped', 'Stopped')}</span>
          )}
        </div>
        <div className="flex gap-2">
          {live.kind === 'streaming' ? (
            <Button variant="outline" onClick={stop}>
              <Square className="mr-2 h-4 w-4" />
              {t('tracing.stopTracing', 'Stop tracing')}
            </Button>
          ) : (
            <Button variant="outline" onClick={reset}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('tracing.restart', 'Restart')}
            </Button>
          )}
        </div>
      </div>

      {live.kind === 'failed' && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {live.error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <TraceTimeline
            events={events}
            anchorTimestamp={anchor || undefined}
            explainSubject={(event) => liveEventSubject(event)}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground text-center">
        {events.length === 1
          ? t('tracing.eventCount_one', '{{count}} event', { count: events.length })
          : t('tracing.eventCount_other', '{{count}} events', { count: events.length })}
        {events.length >= MAX_EVENTS && ' ' + t('tracing.bufferFull', '(buffer full)')}
      </p>
    </div>
  );
}

interface TracingFormProps {
  keywords: string;
  onKeywords: (keywords: string) => void;
  filters: KeyFilter[];
  onFilters: (filters: KeyFilter[]) => void;
  starting: boolean;
  onStart: () => void;
}

/** Keywords and key = value filters for the stream, then Start. */
function TracingForm({ keywords, onKeywords, filters, onFilters, starting, onStart }: TracingFormProps) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const keys = useMemo(() => schema?.enums?.Key ?? [], [schema]);
  const [adding, setAdding] = useState(false);
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');

  const add = () => {
    if (!key || !value.trim()) return;
    onFilters([...filters, { key, label: keys.find((k) => k.name === key)?.label ?? key, value: value.trim() }]);
    setKey('');
    setValue('');
    setAdding(false);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">{t('tracing.liveTitle', 'Live Tracing')}</h1>
        <p className="mt-2 text-muted-foreground">{t('tracing.liveSubtitle', 'Stream server events in real time.')}</p>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('tracing.keywordsLabel', 'Keywords (optional)')}</label>
            <Input
              placeholder={t('tracing.keywordsPlaceholder', 'Enter keywords to filter events...')}
              value={keywords}
              onChange={(e) => onKeywords(e.target.value)}
            />
          </div>

          {filters.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {filters.map((f, i) => (
                <Badge key={i} variant="secondary" className="gap-1">
                  {f.label} = {f.value}
                  <button
                    onClick={() => onFilters(filters.filter((_, j) => j !== i))}
                    className="ml-1 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          {adding ? (
            <div className="flex items-center gap-2">
              <Select value={key} onValueChange={setKey}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder={t('field.selectKey', 'Select key...')} />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {keys.map((k) => (
                    <SelectItem key={k.name} value={k.name}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder={t('tracing.valuePlaceholder', 'Value...')}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && add()}
              />
              <Button size="icon" variant="ghost" onClick={add}>
                <Check className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setAdding(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('tracing.addFilter', 'Add filter')}
            </Button>
          )}

          <Button className="w-full" onClick={onStart} disabled={starting}>
            {starting ? (
              <>
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                {t('tracing.connecting', 'Connecting...')}
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                {t('tracing.startTracing', 'Start tracing')}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
