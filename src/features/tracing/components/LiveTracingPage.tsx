/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Square, RotateCcw, Plus, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSchemaStore } from '@/stores/schemaStore';
import { apiFetch, getApiBaseUrl } from '@/services/api';
import type { TraceEvent } from '../types';
import { normalizeTraceEvents } from '../normalize';
import { TraceTimeline } from './TraceTimeline';
import { liveEventSubject } from '@/features/ai/explain/explain';

const MAX_EVENTS = 1000;
const MAX_RECONNECT = 5;
const RECONNECT_DELAY = 2000;

interface KeyValueFilter {
  key: string;
  label: string;
  value: string;
}

type LiveTracingState =
  | { kind: 'idle' }
  | { kind: 'starting'; keywords: string; filters: KeyValueFilter[] }
  | { kind: 'streaming'; events: TraceEvent[]; anchorTimestamp: string; eventSource: EventSource }
  | { kind: 'stopped'; events: TraceEvent[]; anchorTimestamp: string }
  | { kind: 'error'; events: TraceEvent[]; error: string };

export function LiveTracingPage() {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const [state, setState] = useState<LiveTracingState>({ kind: 'idle' });
  const [keywords, setKeywords] = useState('');
  const [filters, setFilters] = useState<KeyValueFilter[]>([]);
  const [addingFilter, setAddingFilter] = useState(false);
  const [newFilterKey, setNewFilterKey] = useState('');
  const [newFilterValue, setNewFilterValue] = useState('');
  const eventSourceRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<TraceEvent[]>([]);
  const anchorRef = useRef<string>('');
  const reconnectAttempts = useRef(0);

  const keyEnum = useMemo(() => schema?.enums?.['Key'] ?? [], [schema]);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  const openStream = useCallback(async () => {
    setState({ kind: 'starting', keywords, filters });
    eventsRef.current = [];
    anchorRef.current = '';
    reconnectAttempts.current = 0;

    try {
      const tokenResponse = await apiFetch('/api/token/tracing');
      const token = await tokenResponse.text();

      const params = new URLSearchParams();
      params.set('token', token);
      if (keywords.trim()) {
        params.set('filter', keywords.trim());
      }
      for (const f of filters) {
        params.set(f.key, f.value);
      }

      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/live/tracing?${params.toString()}`;

      const connectEventSource = () => {
        const es = new EventSource(url);
        eventSourceRef.current = es;

        es.addEventListener('trace', (event) => {
          try {
            const batch = normalizeTraceEvents(JSON.parse(event.data));
            const currentEvents = eventsRef.current;

            for (const evt of batch) {
              currentEvents.push(evt);
              if (!anchorRef.current) {
                anchorRef.current = evt.timestamp;
              }
            }

            if (currentEvents.length > MAX_EVENTS) {
              eventsRef.current = currentEvents.slice(currentEvents.length - MAX_EVENTS);
            }

            setState({
              kind: 'streaming',
              events: [...eventsRef.current],
              anchorTimestamp: anchorRef.current,
              eventSource: es,
            });
          } catch (e) {
            console.error('Failed to parse trace event:', e);
          }
        });

        es.onopen = () => {
          reconnectAttempts.current = 0;
          setState({
            kind: 'streaming',
            events: [...eventsRef.current],
            anchorTimestamp: anchorRef.current || '',
            eventSource: es,
          });
        };

        es.onerror = () => {
          if (es !== eventSourceRef.current) return;
          es.close();
          eventSourceRef.current = null;

          if (reconnectAttempts.current < MAX_RECONNECT) {
            reconnectAttempts.current++;
            setTimeout(connectEventSource, RECONNECT_DELAY);
          } else {
            setState({
              kind: 'error',
              events: [...eventsRef.current],
              error: t('tracing.liveDisconnected', 'Live tracing stream disconnected after multiple retries.'),
            });
          }
        };
      };

      connectEventSource();
    } catch (e) {
      setState({
        kind: 'error',
        events: [],
        error: e instanceof Error ? e.message : t('tracing.liveFailedStart', 'Failed to start live tracing.'),
      });
    }
  }, [keywords, filters, t]);

  const stopStream = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setState((prev) => {
      if (prev.kind === 'streaming') {
        return {
          kind: 'stopped',
          events: prev.events,
          anchorTimestamp: prev.anchorTimestamp,
        };
      }
      return prev;
    });
  }, []);

  const resetToIdle = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    eventsRef.current = [];
    anchorRef.current = '';
    setState({ kind: 'idle' });
  }, []);

  const addFilter = useCallback(() => {
    if (!newFilterKey || !newFilterValue.trim()) return;
    const keyEntry = keyEnum.find((e) => e.name === newFilterKey);
    setFilters((prev) => [
      ...prev,
      {
        key: newFilterKey,
        label: keyEntry?.label ?? newFilterKey,
        value: newFilterValue.trim(),
      },
    ]);
    setNewFilterKey('');
    setNewFilterValue('');
    setAddingFilter(false);
  }, [newFilterKey, newFilterValue, keyEnum]);

  const removeFilter = useCallback((idx: number) => {
    setFilters((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const isIdle = state.kind === 'idle';
  const isStarting = state.kind === 'starting';
  const isStreaming = state.kind === 'streaming';
  const isStopped = state.kind === 'stopped';
  const isError = state.kind === 'error';

  if (isIdle || isStarting) {
    return (
      <div className="mx-auto max-w-2xl space-y-6 pt-8">
        <div>
          <h1 className="text-2xl font-bold">{t('tracing.liveTitle', 'Live Tracing')}</h1>
          <p className="mt-2 text-muted-foreground">
            {t('tracing.liveSubtitle', 'Stream server events in real time.')}
          </p>
        </div>

        <Card>
          <CardContent className="p-4 space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">{t('tracing.keywordsLabel', 'Keywords (optional)')}</label>
              <Input
                placeholder={t('tracing.keywordsPlaceholder', 'Enter keywords to filter events...')}
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>

            {filters.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {filters.map((f, i) => (
                  <Badge key={i} variant="secondary" className="gap-1">
                    {f.label} = {f.value}
                    <button onClick={() => removeFilter(i)} className="ml-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {addingFilter ? (
              <div className="flex items-center gap-2">
                <Select value={newFilterKey} onValueChange={setNewFilterKey}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder={t('field.selectKey', 'Select key...')} />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {keyEnum.map((entry) => (
                      <SelectItem key={entry.name} value={entry.name}>
                        {entry.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder={t('tracing.valuePlaceholder', 'Value...')}
                  value={newFilterValue}
                  onChange={(e) => setNewFilterValue(e.target.value)}
                  className="flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addFilter();
                  }}
                />
                <Button size="icon" variant="ghost" onClick={addFilter}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setAddingFilter(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setAddingFilter(true)}>
                <Plus className="mr-2 h-4 w-4" />
                {t('tracing.addFilter', 'Add filter')}
              </Button>
            )}

            <Button className="w-full" onClick={openStream} disabled={isStarting}>
              {isStarting ? (
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

  const events = isStreaming ? state.events : isStopped ? state.events : isError ? state.events : [];
  const anchor = isStreaming ? state.anchorTimestamp : isStopped ? state.anchorTimestamp : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t('tracing.liveTitle', 'Live Tracing')}</h2>
          {isStreaming && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              {t('tracing.streamingEvents', 'Streaming events...')}
            </div>
          )}
          {isStopped && <span className="text-sm text-muted-foreground">{t('tracing.stopped', 'Stopped')}</span>}
        </div>
        <div className="flex gap-2">
          {isStreaming && (
            <Button variant="outline" onClick={stopStream}>
              <Square className="mr-2 h-4 w-4" />
              {t('tracing.stopTracing', 'Stop tracing')}
            </Button>
          )}
          {(isStopped || isError) && (
            <Button variant="outline" onClick={resetToIdle}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('tracing.restart', 'Restart')}
            </Button>
          )}
        </div>
      </div>

      {isError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {state.error}
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <TraceTimeline events={events} anchorTimestamp={anchor} explainSubject={(event) => liveEventSubject(event)} />
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
