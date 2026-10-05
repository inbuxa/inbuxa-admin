/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { isValidTarget } from './target';
import { useTranslation } from 'react-i18next';
import {
  Play,
  StopCircle,
  Loader2,
  CircleCheck,
  CircleX,
  TriangleAlert,
  ChevronRight,
  Mail,
  Globe,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { apiFetch, getApiBaseUrl } from '@/services/api';
import type { DeliveryStage, MX, ReportUri, StageSeverity } from './types';
import { stageSeverity } from './types';

function SimpleAlert({ variant, children }: { variant: 'default' | 'destructive'; children: React.ReactNode }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        variant === 'destructive' ? 'border-destructive/50 bg-destructive/10 text-destructive' : 'border-border bg-card'
      }`}
    >
      {children}
    </div>
  );
}

type TraceState =
  | { kind: 'idle' }
  | { kind: 'starting'; target: string }
  | { kind: 'running'; target: string; startedAt: Date; events: DeliveryStage[]; eventSource: EventSource }
  | { kind: 'completed'; target: string; startedAt: Date; completedAt: Date; events: DeliveryStage[] }
  | { kind: 'failed'; target: string; events: DeliveryStage[]; error: string };

function phaseKey(stage: DeliveryStage): string {
  const t = stage.type;
  if (t.startsWith('mxLookup')) return 'mxLookup';
  if (t.startsWith('mtaStsFetch') || t === 'mtaStsNotFound') return 'mtaStsFetch';
  if (t.startsWith('tlsRptLookup') || t === 'tlsRptNotFound') return 'tlsRptLookup';
  if (t.startsWith('mtaStsVerify')) return 'mtaStsVerify';
  if (t.startsWith('tlsaLookup') || t === 'tlsaNotFound') return 'tlsaLookup';
  if (t.startsWith('ipLookup')) return 'ipLookup';
  if (t.startsWith('connection')) return 'connection';
  if (t.startsWith('readGreeting')) return 'readGreeting';
  if (t.startsWith('ehlo')) return 'ehlo';
  if (t.startsWith('startTls')) return 'startTls';
  if (t.startsWith('daneVerify')) return 'daneVerify';
  if (t.startsWith('mailFrom')) return 'mailFrom';
  if (t.startsWith('rcptTo')) return 'rcptTo';
  if (t.startsWith('quit')) return 'quit';
  if (t === 'deliveryAttemptStart') return `attempt-${(stage as { hostname: string }).hostname}`;
  return t;
}

type TFn = (key: string, fallback: string, options?: Record<string, unknown>) => string;

function phaseLabelFor(t: TFn, pk: string): string {
  switch (pk) {
    case 'mxLookup':
      return t('deliveryTrace.phase.mxLookup', 'MX Lookup');
    case 'mtaStsFetch':
      return t('deliveryTrace.phase.mtaStsFetch', 'MTA-STS Policy Fetch');
    case 'tlsRptLookup':
      return t('deliveryTrace.phase.tlsRptLookup', 'TLS-RPT Lookup');
    case 'mtaStsVerify':
      return t('deliveryTrace.phase.mtaStsVerify', 'MTA-STS Verify');
    case 'tlsaLookup':
      return t('deliveryTrace.phase.tlsaLookup', 'TLSA / DANE Lookup');
    case 'ipLookup':
      return t('deliveryTrace.phase.ipLookup', 'IP Lookup');
    case 'connection':
      return t('deliveryTrace.phase.connection', 'TCP Connection');
    case 'readGreeting':
      return t('deliveryTrace.phase.readGreeting', 'Read Greeting');
    case 'ehlo':
      return 'EHLO';
    case 'startTls':
      return 'STARTTLS';
    case 'daneVerify':
      return t('deliveryTrace.phase.daneVerify', 'DANE Verify');
    case 'mailFrom':
      return 'MAIL FROM';
    case 'rcptTo':
      return 'RCPT TO';
    case 'quit':
      return 'QUIT';
    default:
      return pk;
  }
}

function phaseLabel(t: TFn, stage: DeliveryStage): string {
  if (stage.type === 'deliveryAttemptStart') {
    return t('deliveryTrace.attemptLabel', 'Delivery Attempt: {{hostname}}', {
      hostname: (stage as { hostname: string }).hostname,
    });
  }
  const pk = phaseKey(stage);
  return phaseLabelFor(t, pk);
}

function SeverityIcon({ severity }: { severity: StageSeverity }) {
  switch (severity) {
    case 'pending':
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    case 'ok':
      return <CircleCheck className="h-4 w-4 text-emerald-500" />;
    case 'warn':
      return <TriangleAlert className="h-4 w-4 text-amber-500" />;
    case 'error':
      return <CircleX className="h-4 w-4 text-red-500" />;
  }
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function eventBodyText(t: TFn, stage: DeliveryStage): string | null {
  const stageType = stage.type;
  switch (stageType) {
    case 'mxLookupSuccess': {
      const total = stage.mxs.reduce((n, mx) => n + mx.exchanges.length, 0);
      return total === 1
        ? t('deliveryTrace.body.mxLookupSuccess_one', 'Resolved {{count}} MX record', { count: total })
        : t('deliveryTrace.body.mxLookupSuccess_other', 'Resolved {{count}} MX records', { count: total });
    }
    case 'mxLookupStart':
      return t('deliveryTrace.body.mxLookupStart', 'Looking up MX for {{domain}}', { domain: stage.domain });
    case 'mtaStsFetchSuccess':
      return t('deliveryTrace.body.mtaStsFetchSuccess', 'Policy fetched successfully');
    case 'mtaStsNotFound':
      return t('deliveryTrace.body.mtaStsNotFound', 'No MTA-STS policy published');
    case 'tlsRptLookupSuccess': {
      const n = stage.rua.length;
      return n === 1
        ? t('deliveryTrace.body.tlsRptLookupSuccess_one', 'Found {{count}} reporting URI', { count: n })
        : t('deliveryTrace.body.tlsRptLookupSuccess_other', 'Found {{count}} reporting URIs', { count: n });
    }
    case 'tlsRptNotFound':
      return t('deliveryTrace.body.tlsRptNotFound', 'No TLS-RPT record published');
    case 'ipLookupSuccess': {
      const ips = stage.remoteIps;
      return ips.length <= 3
        ? ips.join(', ')
        : t('deliveryTrace.body.ipLookupOverflow', '{{shown}} +{{extra}} more', {
            shown: ips.slice(0, 3).join(', '),
            extra: ips.length - 3,
          });
    }
    case 'connectionStart':
      return t('deliveryTrace.body.connectionStart', 'Connecting to {{ip}}', { ip: stage.remoteIp });
    case 'connectionSuccess':
      return t('deliveryTrace.body.connectionSuccess', 'Connected');
    case 'tlsaLookupSuccess':
      return t('deliveryTrace.body.tlsaLookupSuccess', 'TLSA record found');
    case 'tlsaNotFound':
      return stage.reason || t('deliveryTrace.body.tlsaNotFound', 'No TLSA record found');
    case 'readGreetingSuccess':
      return t('deliveryTrace.body.readGreetingSuccess', 'Server greeting received');
    case 'ehloSuccess':
      return t('deliveryTrace.body.ehloSuccess', 'EHLO accepted');
    case 'startTlsSuccess':
      return t('deliveryTrace.body.startTlsSuccess', 'TLS negotiated');
    case 'daneVerifySuccess':
      return t('deliveryTrace.body.daneVerifySuccess', 'DANE verification passed');
    case 'mtaStsVerifySuccess':
      return t('deliveryTrace.body.mtaStsVerifySuccess', 'MTA-STS hostname verified');
    case 'mailFromSuccess':
      return t('deliveryTrace.body.mailFromSuccess', 'Sender accepted');
    case 'rcptToSuccess':
      return t('deliveryTrace.body.rcptToSuccess', 'Recipient accepted');
    case 'quitCompleted':
      return t('deliveryTrace.body.quitCompleted', 'Session closed');
    default:
      if ('reason' in stage && typeof (stage as { reason?: string }).reason === 'string') {
        return (stage as { reason: string }).reason;
      }
      return null;
  }
}

function MxTable({ mxs }: { mxs: MX[] }) {
  const sorted = [...mxs].sort((a, b) => a.preference - b.preference);
  return (
    <div className="mt-1 rounded border text-xs">
      {sorted.map((mx, i) =>
        mx.exchanges.map((ex, j) => (
          <div key={`${i}-${j}`} className="flex gap-3 px-3 py-1 border-b last:border-b-0">
            <span className="w-8 text-right text-muted-foreground">{mx.preference}</span>
            <span>{ex}</span>
          </div>
        )),
      )}
    </div>
  );
}

function ReportUris({ rua }: { rua: ReportUri[] }) {
  return (
    <div className="mt-1 space-y-1">
      {rua.map((uri, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          {uri.type === 'mail' ? (
            <>
              <Mail className="h-3 w-3 text-muted-foreground" />
              <span>{uri.email}</span>
            </>
          ) : (
            <>
              <Globe className="h-3 w-3 text-muted-foreground" />
              <span>{uri.url}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function OpaqueObject({ data }: { data: Record<string, unknown> }) {
  return (
    <div className="mt-1 rounded border bg-muted/30 p-2">
      <dl className="space-y-1 text-xs">
        {Object.entries(data).map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="font-medium text-muted-foreground min-w-24">{k}</dt>
            <dd className="break-all">
              {typeof v === 'object' && v !== null ? (
                <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(v, null, 2)}</pre>
              ) : (
                String(v)
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EventRow({ stage }: { stage: DeliveryStage }) {
  const { t } = useTranslation();
  const severity = stageSeverity(stage);
  const body = eventBodyText(t, stage);
  const elapsed = 'elapsed' in stage ? (stage as { elapsed: number }).elapsed : null;
  const hasDetails =
    stage.type === 'mxLookupSuccess' ||
    stage.type === 'mtaStsFetchSuccess' ||
    stage.type === 'tlsRptLookupSuccess' ||
    stage.type === 'tlsaLookupSuccess';

  const content = (
    <div className="flex items-start gap-3 py-2">
      <div className="mt-0.5 shrink-0">
        <SeverityIcon severity={severity} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{phaseLabel(t, stage)}</span>
          {elapsed !== null && (
            <Badge variant="secondary" className="text-xs">
              {formatElapsed(elapsed)}
            </Badge>
          )}
        </div>
        {body && (
          <p className={`text-xs mt-0.5 ${severity === 'error' ? 'text-red-500' : 'text-muted-foreground'}`}>{body}</p>
        )}
      </div>
    </div>
  );

  if (!hasDetails) return content;

  return (
    <Collapsible>
      {content}
      <CollapsibleTrigger asChild>
        <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-7">
          <ChevronRight className="h-3 w-3" />
          {t('deliveryTrace.viewDetails', 'View details')}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-7">
        {stage.type === 'mxLookupSuccess' && <MxTable mxs={stage.mxs} />}
        {stage.type === 'mtaStsFetchSuccess' && <OpaqueObject data={stage.policy} />}
        {stage.type === 'tlsRptLookupSuccess' && <ReportUris rua={stage.rua} />}
        {stage.type === 'tlsaLookupSuccess' && <OpaqueObject data={stage.record} />}
      </CollapsibleContent>
    </Collapsible>
  );
}

function useRelativeTime(startedAtMs: number | null): string {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (startedAtMs === null) return;
    const id = setInterval(() => setTick((prev) => prev + 1), 1000);
    return () => clearInterval(id);
  }, [startedAtMs]);

  if (startedAtMs === null) return '';
  const s = tick;
  if (s < 60) return t('deliveryTrace.startedAgoSec', 'Started {{s}}s ago', { s });
  return t('deliveryTrace.startedAgoMin', 'Started {{m}}m {{s}}s ago', {
    m: Math.floor(s / 60),
    s: s % 60,
  });
}

export function DeliveryTracePage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const [inputValue, setInputValue] = useState(searchParams.get('target') ?? '');
  const [inputError, setInputError] = useState<string | null>(null);
  const [state, setState] = useState<TraceState>({ kind: 'idle' });
  const eventSourceRef = useRef<EventSource | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const relTime = useRelativeTime(state.kind === 'running' ? state.startedAt.getTime() : null);

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const startTrace = useCallback(async () => {
    const target = inputValue.trim();
    if (!isValidTarget(target)) {
      setInputError(t('deliveryTrace.invalidTarget', 'Enter a valid email address or domain.'));
      return;
    }
    setInputError(null);

    setState({ kind: 'starting', target });

    try {
      const tokenResponse = await apiFetch('/api/token/delivery');
      const token = await tokenResponse.text();

      const baseUrl = getApiBaseUrl();
      const url = `${baseUrl}/api/live/delivery/${encodeURIComponent(target)}?token=${encodeURIComponent(token)}`;

      const es = new EventSource(url);
      eventSourceRef.current = es;

      const events: DeliveryStage[] = [];
      const startedAt = new Date();

      timeoutRef.current = setTimeout(() => {
        es.close();
        eventSourceRef.current = null;
        setState({
          kind: 'failed',
          target,
          events: [...events],
          error: t('deliveryTrace.timedOut', 'Trace timed out after 120 seconds.'),
        });
      }, 120_000);

      es.addEventListener('event', (event) => {
        try {
          const batch = JSON.parse(event.data) as DeliveryStage[];
          for (const stage of batch) {
            if (stage.type === 'completed') {
              es.close();
              eventSourceRef.current = null;
              if (timeoutRef.current) clearTimeout(timeoutRef.current);
              setState({
                kind: 'completed',
                target,
                startedAt,
                completedAt: new Date(),
                events: [...events],
              });
              return;
            }
            events.push(stage);
          }
          setState({
            kind: 'running',
            target,
            startedAt,
            events: [...events],
            eventSource: es,
          });
        } catch (e) {
          console.error('Failed to parse delivery event:', e);
        }
      });

      es.onopen = () => {
        setState({
          kind: 'running',
          target,
          startedAt,
          events: [],
          eventSource: es,
        });
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        setState((prev) => {
          if (prev.kind === 'completed') return prev;
          return {
            kind: 'failed',
            target,
            events: prev.kind === 'running' ? prev.events : [],
            error: t('deliveryTrace.connectionLost', 'Connection lost before trace completed.'),
          };
        });
      };
    } catch (e) {
      setState({
        kind: 'failed',
        target,
        events: [],
        error: e instanceof Error ? e.message : t('deliveryTrace.failedToStart', 'Failed to start trace.'),
      });
    }
  }, [inputValue, t]);

  const cancelTrace = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setState({ kind: 'idle' });
  }, []);

  const resetToIdle = useCallback(() => {
    setState({ kind: 'idle' });
  }, []);

  const rawEvents = useMemo(() => (state.kind === 'idle' || state.kind === 'starting' ? [] : state.events), [state]);
  const pairedEvents = useMemo(() => {
    const result: DeliveryStage[] = [];
    const pendingByPhase = new Map<string, number>();

    for (const evt of rawEvents) {
      const pk = phaseKey(evt);
      const severity = stageSeverity(evt);

      if (severity === 'pending') {
        pendingByPhase.set(pk, result.length);
        result.push(evt);
      } else {
        const pendingIdx = pendingByPhase.get(pk);
        if (pendingIdx !== undefined) {
          result[pendingIdx] = evt;
          pendingByPhase.delete(pk);
        } else {
          result.push(evt);
        }
      }
    }
    return result;
  }, [rawEvents]);

  if (state.kind === 'idle' || state.kind === 'starting') {
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
              <label className="text-sm font-medium">
                {t('deliveryTrace.targetLabel', 'Target address or domain')}
              </label>
              <div className="flex gap-2">
                <Input
                  placeholder={t('deliveryTrace.targetPlaceholder', 'john@example.org or example.org')}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    setInputError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') startTrace();
                  }}
                  autoFocus
                  className="flex-1"
                />
                <Button onClick={startTrace} disabled={state.kind === 'starting'}>
                  {state.kind === 'starting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span className="ml-2">{t('deliveryTrace.startTrace', 'Start trace')}</span>
                </Button>
              </div>
              {inputError && <p className="text-xs text-destructive">{inputError}</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const events = pairedEvents;
  const target = state.target;
  const isRunning = state.kind === 'running';
  const isCompleted = state.kind === 'completed';
  const isFailed = state.kind === 'failed';

  const groups: { attempt: DeliveryStage | null; events: DeliveryStage[] }[] = [];
  let currentGroup: { attempt: DeliveryStage | null; events: DeliveryStage[] } = {
    attempt: null,
    events: [],
  };
  for (const evt of events) {
    if (evt.type === 'deliveryAttemptStart') {
      if (currentGroup.events.length > 0 || currentGroup.attempt) {
        groups.push(currentGroup);
      }
      currentGroup = { attempt: evt, events: [] };
    } else {
      currentGroup.events.push(evt);
    }
  }
  if (currentGroup.events.length > 0 || currentGroup.attempt) {
    groups.push(currentGroup);
  }

  const attemptCount = events.filter((e) => e.type === 'deliveryAttemptStart').length;
  const lastEvent = events[events.length - 1];
  const hasSuccessfulDelivery = lastEvent?.type === 'quitCompleted' || events.some((e) => e.type === 'rcptToSuccess');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">
            {isRunning
              ? t('deliveryTrace.tracingDelivery', 'Tracing delivery to {{target}}', { target })
              : isCompleted
                ? t('deliveryTrace.traceCompletedFor', 'Trace completed for {{target}}', { target })
                : t('deliveryTrace.traceFailedFor', 'Trace failed for {{target}}', { target })}
          </h2>
          {isRunning && <p className="text-sm text-muted-foreground">{relTime}</p>}
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <Button variant="outline" onClick={cancelTrace}>
              <StopCircle className="mr-2 h-4 w-4" />
              {t('deliveryTrace.cancelTrace', 'Cancel trace')}
            </Button>
          )}
          {(isCompleted || isFailed) && (
            <Button variant="outline" onClick={resetToIdle}>
              {t('deliveryTrace.runAnother', 'Run another trace')}
            </Button>
          )}
        </div>
      </div>

      {isCompleted && (
        <SimpleAlert variant="default">
          <div className="flex items-center gap-2">
            {hasSuccessfulDelivery ? (
              <CircleCheck className="h-4 w-4 text-emerald-500" />
            ) : (
              <CircleX className="h-4 w-4 text-red-500" />
            )}
            <span className="text-sm font-medium">
              {hasSuccessfulDelivery
                ? t('deliveryTrace.deliverySuccessful', 'Delivery successful')
                : t('deliveryTrace.deliveryFailed', 'Delivery failed')}
            </span>
            <span className="text-sm text-muted-foreground">
              {attemptCount === 1
                ? t('deliveryTrace.attemptCount_one', '{{count}} attempt', { count: attemptCount })
                : t('deliveryTrace.attemptCount_other', '{{count}} attempts', { count: attemptCount })}
              {state.kind === 'completed' && (
                <>
                  {' '}
                  {t('deliveryTrace.inDuration', 'in {{elapsed}}', {
                    elapsed: formatElapsed(state.completedAt.getTime() - state.startedAt.getTime()),
                  })}
                </>
              )}
            </span>
          </div>
        </SimpleAlert>
      )}

      {isFailed && (
        <SimpleAlert variant="destructive">
          <p className="text-sm">{state.error}</p>
        </SimpleAlert>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="space-y-0">
            {groups.map((group, gi) => (
              <div key={gi}>
                {group.attempt && (
                  <div className="mt-3 mb-1">
                    <EventRow stage={group.attempt} />
                  </div>
                )}
                <div className={group.attempt ? 'ml-6 border-l-2 border-muted/40 pl-4' : ''}>
                  {group.events.map((evt, ei) => (
                    <EventRow key={`${gi}-${ei}`} stage={evt} />
                  ))}
                </div>
              </div>
            ))}
          </div>

          {isRunning && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <div className="flex gap-1">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: '0.2s' }}>
                  .
                </span>
                <span className="animate-pulse" style={{ animationDelay: '0.4s' }}>
                  .
                </span>
              </div>
              {t('deliveryTrace.waiting', 'Waiting for more events')}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
