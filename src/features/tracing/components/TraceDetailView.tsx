/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowLeft, Clock, FileText, Loader2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { resolveObject } from '@/lib/schemaResolver';
import { getAccountId, jmapGet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import { longDuration, traceSummary } from '../format';
import { normalizeTraceEvents } from '../normalize';
import type { TraceEvent } from '../types';
import { TraceTimeline } from './TraceTimeline';

type Loaded = { kind: 'loading' } | { kind: 'failed'; error: string } | { kind: 'loaded'; events: TraceEvent[] };

/** A stored trace (`x:Trace`): a summary of the span, then its events. */
export function TraceDetailView({ viewName, objectId }: { viewName: string; objectId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const schema = useSchemaStore((s) => s.schema);
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' });

  useEffect(() => {
    if (!schema) return;
    let current = true;
    void (async () => {
      try {
        const object = resolveObject(schema, viewName);
        if (!object) throw new Error(t('view.couldNotResolve', 'Could not resolve object'));
        const responses = await jmapGet(object.objectName, getAccountId(object.objectName), [objectId]);
        if (!current) return;
        const got = responses.find(([name]) => name.endsWith('/get'));
        if (!got) throw new Error(t('view.noGetResponse', 'No get response'));
        const trace = (got[1].list as { events?: unknown }[] | undefined)?.[0];
        if (!trace) throw new Error(t('tracing.traceNotFound', 'Trace not found'));
        setLoaded({ kind: 'loaded', events: normalizeTraceEvents(trace.events) });
      } catch (e) {
        if (current) {
          setLoaded({
            kind: 'failed',
            error: e instanceof Error ? e.message : t('tracing.failedToLoadTrace', 'Failed to load trace'),
          });
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [schema, viewName, objectId, t]);

  if (loaded.kind === 'loading') {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (loaded.kind === 'failed') {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={() => navigate(-1)}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          {t('common.back', 'Back')}
        </Button>
        <div className="text-destructive p-4">{loaded.error}</div>
      </div>
    );
  }

  const { events } = loaded;
  const eventNames = new Map((schema?.enums?.EventType ?? []).map((e) => [e.name, e.label]));
  const summary = traceSummary(events, (event) => eventNames.get(event));

  return (
    <div className="space-y-6">
      <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {t('common.back', 'Back')}
      </Button>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        <Fact icon={<FileText className="h-4 w-4" />} name={t('tracing.spanType', 'Span Type')} truncate>
          {summary.span ?? '-'}
        </Fact>
        <Fact icon={<Clock className="h-4 w-4" />} name={t('tracing.date', 'Date')}>
          {summary.startedAt
            ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(
                new Date(summary.startedAt),
              )
            : '-'}
        </Fact>
        <Fact icon={<Timer className="h-4 w-4" />} name={t('tracing.duration', 'Duration')}>
          {summary.durationMs !== null ? longDuration(summary.durationMs) : '-'}
        </Fact>
        <Fact icon={<Activity className="h-4 w-4" />} name={t('tracing.events', 'Events')}>
          {events.length}
        </Fact>
      </div>

      <Card>
        <CardContent className="p-4">
          <TraceTimeline
            events={events}
            anchorTimestamp={summary.startedAt ?? undefined}
            explainSubject={(_, index) => ({ '@type': 'TraceEvent', traceId: objectId, index })}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Fact({
  icon,
  name,
  truncate,
  children,
}: {
  icon: ReactNode;
  name: string;
  truncate?: boolean;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {icon}
          {name}
        </div>
        <p className={`mt-1 text-lg font-semibold${truncate ? ' truncate' : ''}`}>{children}</p>
      </CardContent>
    </Card>
  );
}
