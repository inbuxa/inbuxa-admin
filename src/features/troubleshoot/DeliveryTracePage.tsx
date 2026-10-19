/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight,
  CircleCheck,
  CircleX,
  Globe,
  Loader2,
  Mail,
  Play,
  StopCircle,
  TriangleAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { streamDeliveryTrace, type StreamFailure } from './stream';
import { isValidTarget } from './target';
import {
  byAttempt,
  formatElapsed,
  outcome,
  pairStages,
  stageDetail,
  stageLabel,
  stageSeverity,
  traceReducer,
  type StageSeverity,
} from './trace';
import type { DeliveryStage, MX, ReportUri } from './types';

/** Runs one trace at a time, stopping it when the page goes away. */
function useDeliveryTrace() {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(traceReducer, { kind: 'idle' });
  const stop = useRef<(() => void) | null>(null);

  const halt = useCallback(() => {
    stop.current?.();
    stop.current = null;
  }, []);
  useEffect(() => halt, [halt]);

  const failure = useCallback(
    (f: StreamFailure) => {
      switch (f.reason) {
        case 'lost':
          return t('deliveryTrace.connectionLost', 'Connection lost before trace completed.');
        case 'timeout':
          return t('deliveryTrace.timedOut', 'Trace timed out after 120 seconds.');
        case 'start':
          return f.message ?? t('deliveryTrace.failedToStart', 'Failed to start trace.');
      }
    },
    [t],
  );

  const start = useCallback(
    (target: string) => {
      halt();
      dispatch({ type: 'start', target });
      stop.current = streamDeliveryTrace(target, {
        opened: (at) => dispatch({ type: 'opened', at }),
        stages: (stages, at) => dispatch({ type: 'stages', stages, at }),
        failed: (f) => dispatch({ type: 'failed', error: failure(f) }),
      });
    },
    [halt, failure],
  );

  const reset = useCallback(() => {
    halt();
    dispatch({ type: 'reset' });
  }, [halt]);

  return { state, start, reset };
}

/** Whole seconds since a moment, ticking once a second. */
function useSecondsSince(since: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, Math.floor((now - since) / 1000));
}

function Notice({ tone, children }: { tone: 'default' | 'destructive'; children: ReactNode }) {
  const look =
    tone === 'destructive' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border bg-card';
  return <div className={`rounded-lg border p-4 ${look}`}>{children}</div>;
}

const SEVERITY_ICON: Record<StageSeverity, ReactNode> = {
  pending: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  ok: <CircleCheck className="h-4 w-4 text-emerald-500" />,
  warn: <TriangleAlert className="h-4 w-4 text-amber-500" />,
  error: <CircleX className="h-4 w-4 text-red-500" />,
};

/** MX hosts, most preferred first. */
function MxHosts({ mxs }: { mxs: MX[] }) {
  const rows = [...mxs]
    .sort((a, b) => a.preference - b.preference)
    .flatMap((mx) => mx.exchanges.map((host) => ({ preference: mx.preference, host })));
  return (
    <div className="mt-1 rounded border text-xs">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-3 px-3 py-1 border-b last:border-b-0">
          <span className="w-8 text-right text-muted-foreground">{row.preference}</span>
          <span>{row.host}</span>
        </div>
      ))}
    </div>
  );
}

function ReportDestinations({ rua }: { rua: ReportUri[] }) {
  return (
    <div className="mt-1 space-y-1">
      {rua.map((uri, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {uri.type === 'mail' ? (
            <Mail className="h-3 w-3 text-muted-foreground" />
          ) : (
            <Globe className="h-3 w-3 text-muted-foreground" />
          )}
          <span>{uri.type === 'mail' ? uri.email : uri.url}</span>
        </div>
      ))}
    </div>
  );
}

/** A policy or record as the server sent it: one line per field, nested values as JSON. */
function RawFields({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-1 rounded border bg-muted/30 p-2">
      <dl className="space-y-1 text-xs">
        {Object.entries(data).map(([name, value]) => (
          <div key={name} className="flex gap-2">
            <dt className="font-medium text-muted-foreground min-w-24">{name}</dt>
            <dd className="break-all">
              {value !== null && typeof value === 'object' ? (
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(value, null, 2)}</pre>
              ) : (
                String(value)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** What a step found, for the steps that found something worth opening. */
function stepDetails(stage: DeliveryStage): ReactNode {
  switch (stage.type) {
    case 'mxLookupSuccess':
      return <MxHosts mxs={stage.mxs} />;
    case 'tlsRptLookupSuccess':
      return <ReportDestinations rua={stage.rua} />;
    case 'mtaStsFetchSuccess':
      return <RawFields data={stage.policy} />;
    case 'tlsaLookupSuccess':
      return <RawFields data={stage.record} />;
    default:
      return null;
  }
}

function StepRow({ stage }: { stage: DeliveryStage }) {
  const { t } = useTranslation();
  const severity = stageSeverity(stage);
  const detail = stageDetail(t, stage);
  const details = stepDetails(stage);

  const row = (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">{SEVERITY_ICON[severity]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{stageLabel(t, stage)}</span>
          {'elapsed' in stage && (
            <Badge variant="secondary" className="text-xs">
              {formatElapsed(stage.elapsed)}
            </Badge>
          )}
        </div>
        {detail && (
          <p className={`text-xs mt-0.5 ${severity === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>
            {detail}
          </p>
        )}
      </div>
    </div>
  );
  if (!details) return row;

  return (
    <Collapsible>
      {row}
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-7">
          <ChevronRight className="h-3 w-3" />
          {t('deliveryTrace.viewDetails', 'View details')}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-7">{details}</CollapsibleContent>
    </Collapsible>
  );
}

interface TraceFormProps {
  target: string;
  onTargetChange: (target: string) => void;
  starting: boolean;
  onStart: (target: string) => void;
}

function TraceForm({ target, onTargetChange, starting, onStart }: TraceFormProps) {
  const { t } = useTranslation();
  const [invalid, setInvalid] = useState(false);

  const submit = () => {
    const value = target.trim();
    if (isValidTarget(value)) onStart(value);
    else setInvalid(true);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pt-8">
      <div>
        <h1 className="text-2xl font-bold">{t('deliveryTrace.title', 'Delivery Trace')}</h1>
        <p className="mt-2 text-muted-foreground">
          {t(
            'deliveryTrace.subtitle',
            'Run a real outbound SMTP delivery attempt and watch every DNS lookup, TLS handshake, and SMTP command as it happens.',
          )}
        </p>
      </div>
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">{t('deliveryTrace.targetLabel', 'Target address or domain')}</label>
            <div className="flex gap-2">
              <Input
                placeholder={t('deliveryTrace.targetPlaceholder', 'john@example.org or example.org')}
                value={target}
                onChange={(e) => {
                  onTargetChange(e.target.value);
                  setInvalid(false);
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
                autoFocus
                className="flex-1"
              />
              <Button onClick={submit} disabled={starting}>
                {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                <span className="ml-2">{t('deliveryTrace.startTrace', 'Start trace')}</span>
              </Button>
            </div>
            {invalid && (
              <p className="text-xs text-destructive">
                {t('deliveryTrace.invalidTarget', 'Enter a valid email address or domain.')}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StartedAgo({ since }: { since: number }) {
  const { t } = useTranslation();
  const seconds = useSecondsSince(since);
  return (
    <p className="text-sm text-muted-foreground">
      {seconds < 60
        ? t('deliveryTrace.startedAgoSec', 'Started {{s}}s ago', { s: seconds })
        : t('deliveryTrace.startedAgoMin', 'Started {{m}}m {{s}}s ago', {
            m: Math.floor(seconds / 60),
            s: seconds % 60,
          })}
    </p>
  );
}

export function DeliveryTracePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  // Kept here, not in the form, so the form still has it after a trace.
  const [input, setInput] = useState(searchParams.get('target') ?? '');
  const { state, start, reset } = useDeliveryTrace();
  const events = state.kind === 'idle' || state.kind === 'starting' ? null : state.events;
  const rows = useMemo(() => (events ? pairStages(events) : []), [events]);

  if (state.kind === 'idle' || state.kind === 'starting') {
    return <TraceForm target={input} onTargetChange={setInput} starting={state.kind === 'starting'} onStart={start} />;
  }

  const { target } = state;
  const { attempts, delivered } = outcome(rows);
  const heading = {
    running: () => t('deliveryTrace.tracingDelivery', 'Tracing delivery to {{target}}', { target }),
    completed: () => t('deliveryTrace.traceCompletedFor', 'Trace completed for {{target}}', { target }),
    failed: () => t('deliveryTrace.traceFailedFor', 'Trace failed for {{target}}', { target }),
  }[state.kind]();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">{heading}</h2>
          {state.kind === 'running' && <StartedAgo since={state.startedAt} />}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset}>
            {state.kind === 'running' ? (
              <>
                <StopCircle className="mr-2 h-4 w-4" />
                {t('deliveryTrace.cancelTrace', 'Cancel trace')}
              </>
            ) : (
              t('deliveryTrace.runAnother', 'Run another trace')
            )}
          </Button>
        </div>
      </div>

      {state.kind === 'completed' && (
        <Notice tone="default">
          <div className="flex items-center gap-2">
            {delivered ? (
              <CircleCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <CircleX className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium">
              {delivered
                ? t('deliveryTrace.deliverySuccessful', 'Delivery successful')
                : t('deliveryTrace.deliveryFailed', 'Delivery failed')}
            </span>
            <span className="text-sm text-muted-foreground">
              {attempts === 1
                ? t('deliveryTrace.attemptCount_one', '{{count}} attempt', { count: attempts })
                : t('deliveryTrace.attemptCount_other', '{{count}} attempts', { count: attempts })}{' '}
              {t('deliveryTrace.inDuration', 'in {{elapsed}}', {
                elapsed: formatElapsed(state.completedAt - state.startedAt),
              })}
            </span>
          </div>
        </Notice>
      )}

      {state.kind === 'failed' && (
        <Notice tone="destructive">
          <p className="text-sm">{state.error}</p>
        </Notice>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="space-y-0">
            {byAttempt(rows).map((group, gi) => (
              <div key={gi}>
                {group.attempt && (
                  <div className="mt-3 mb-1">
                    <StepRow stage={group.attempt} />
                  </div>
                )}
                <div className={group.attempt ? 'ml-6 border-l-2 border-muted/40 pl-4' : ''}>
                  {group.events.map((stage, ei) => (
                    <StepRow key={`${gi}-${ei}`} stage={stage} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {state.kind === 'running' && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex gap-1">
                {[0, 0.2, 0.4].map((delay) => (
                  <span
                    key={delay}
                    className="animate-pulse"
                    style={delay ? { animationDelay: `${delay}s` } : undefined}
                  >
                    .
                  </span>
                ))}
              </div>
              {t('deliveryTrace.waiting', 'Waiting for more events')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
