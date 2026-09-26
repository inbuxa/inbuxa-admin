/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CircleDot, CircleX, Clock } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import type { TraceEvent, TraceKeyValue, TraceValue } from '../types';
import { ExplainButton } from '@/features/ai/explain/ExplainButton';
import { isRawEvent, type ExplainSubject } from '@/features/ai/explain/explain';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz792013';

function intToBase32(input: number | string): string {
  let n: bigint;
  try {
    n = BigInt(typeof input === 'number' ? Math.floor(input) : input);
  } catch {
    return String(input);
  }
  if (n === 0n) return 'a';
  const chars: string[] = [];
  while (n > 0n) {
    chars.push(BASE32_ALPHABET[Number(n % 32n)]);
    n = n / 32n;
  }
  return chars.reverse().join('');
}

function isIdKey(key: string): boolean {
  return key === 'id' || key.endsWith('Id');
}

interface TraceTimelineProps {
  events: TraceEvent[];
  anchorTimestamp?: string;
  /** inbuxa: what "Explain this" asks about an event (ai-explain EX-17). */
  explainSubject?: (event: TraceEvent, index: number) => ExplainSubject;
}

export function TraceTimeline({ events, anchorTimestamp, explainSubject }: TraceTimelineProps) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const containerRef = useRef<HTMLDivElement>(null);
  const wasAtBottomRef = useRef(true);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (wasAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [events.length]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    wasAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  };

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {t('tracing.noEvents', 'No trace events to display.')}
      </div>
    );
  }

  const anchorMs = anchorTimestamp ? new Date(anchorTimestamp).getTime() : new Date(events[0].timestamp).getTime();

  const eventTypeEnum = schema?.enums?.['EventType'] ?? [];
  const keyEnum = schema?.enums?.['Key'] ?? [];

  function resolveEventLabel(eventType: string): { label: string; explanation?: string } {
    const entry = eventTypeEnum.find((e) => e.name === eventType);
    if (entry) return { label: entry.label, explanation: entry.explanation };
    return { label: eventType };
  }

  function resolveKeyLabel(key: string): string {
    const entry = keyEnum.find((e) => e.name === key);
    return entry?.label ?? key;
  }

  function eventIcon(eventType: string) {
    if (
      eventType.includes('error') ||
      eventType.includes('failed') ||
      eventType.includes('invalid') ||
      eventType.includes('reject')
    ) {
      return <CircleX className="h-4 w-4 text-red-500" />;
    }
    if (eventType.endsWith('-start') || eventType.endsWith('-end')) {
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
    return <CircleDot className="h-4 w-4 text-muted-foreground" />;
  }

  function formatAbsoluteTime(ts: string): string {
    const d = new Date(ts);
    return d.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    } as Intl.DateTimeFormatOptions);
  }

  function formatRelativeTime(ts: string): string {
    const ms = new Date(ts).getTime() - anchorMs;
    if (ms <= 0) return '(+0 ms)';
    if (ms < 1000) return `(+${Math.round(ms)} ms)`;
    if (ms < 60_000) return `(+${(ms / 1000).toFixed(1)} s)`;
    const m = Math.floor(ms / 60_000);
    const s = Math.floor((ms % 60_000) / 1000);
    return `(+${m} m ${s} s)`;
  }

  return (
    <div className="relative">
      <div ref={containerRef} onScroll={handleScroll} className="max-h-[70vh] overflow-y-auto scroll-smooth">
        <div className="space-y-4 p-2">
          {events.map((event, idx) => {
            const { label, explanation } = resolveEventLabel(event.event);
            const isFallback = !eventTypeEnum.find((e) => e.name === event.event);

            return (
              <div key={idx} className="flex gap-3">
                <div className="mt-1 shrink-0">{eventIcon(event.event)}</div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {isFallback ? (
                        <span className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">{label}</span>
                      ) : (
                        <span className="text-sm font-semibold">{label}</span>
                      )}
                      {explanation && <p className="text-xs text-muted-foreground mt-0.5">{explanation}</p>}
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {/* inbuxa: raw protocol traffic isn't sent to the model (EX-9) */}
                      {explainSubject && !isRawEvent(event.event) && (
                        <ExplainButton
                          icon
                          className="mt-0.5"
                          title={label}
                          subject={() => explainSubject(event, idx)}
                        />
                      )}
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{formatAbsoluteTime(event.timestamp)}</div>
                        <div className="text-xs text-muted-foreground/60">{formatRelativeTime(event.timestamp)}</div>
                      </div>
                    </div>
                  </div>

                  {event.keyValues.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {event.keyValues.map((kv, ki) => (
                        <TraceKeyValueRow
                          key={ki}
                          kv={kv}
                          resolveKeyLabel={resolveKeyLabel}
                          resolveEventLabel={resolveEventLabel}
                          depth={0}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-card to-transparent" />
    </div>
  );
}

function TlsBoolean({ on }: { on: boolean }) {
  const { t } = useTranslation();
  return <>{on ? t('tracing.enabled', 'enabled') : t('tracing.disabled', 'disabled')}</>;
}

function TraceKeyValueRow({
  kv,
  resolveKeyLabel,
  resolveEventLabel,
  depth,
}: {
  kv: TraceKeyValue;
  resolveKeyLabel: (key: string) => string;
  resolveEventLabel: (event: string) => { label: string; explanation?: string };
  depth: number;
}) {
  const label = resolveKeyLabel(kv.key);
  const viewToSection = useSchemaStore((s) => s.viewToSection);

  return (
    <div className="flex gap-2 text-sm" style={{ paddingLeft: depth * 16 }}>
      <span className="shrink-0 text-muted-foreground text-xs min-w-24 text-right pt-0.5">{label}</span>
      <span className="text-xs pt-0.5">
        <TraceValueDisplay
          keyName={kv.key}
          value={kv.value}
          resolveKeyLabel={resolveKeyLabel}
          resolveEventLabel={resolveEventLabel}
          viewToSection={viewToSection}
          depth={depth}
        />
      </span>
    </div>
  );
}

function TraceValueDisplay({
  keyName,
  value,
  resolveKeyLabel,
  resolveEventLabel,
  viewToSection,
  depth,
}: {
  keyName: string;
  value: TraceValue;
  resolveKeyLabel: (key: string) => string;
  resolveEventLabel: (event: string) => { label: string; explanation?: string };
  viewToSection: Record<string, string>;
  depth: number;
}) {
  switch (value['@type']) {
    case 'String':
      return <>{value.value}</>;
    case 'UnsignedInt':
    case 'Integer': {
      const raw = value.value;
      const numericInput =
        typeof raw === 'object' && raw !== null && 'source' in (raw as Record<string, unknown>)
          ? ((raw as Record<string, unknown>).source as string)
          : raw;

      if (isIdKey(keyName)) {
        const encoded = intToBase32(numericInput as number | string);
        if (keyName === 'queueId') {
          const section = viewToSection['x:QueuedMessage'] ?? 'Management';
          return (
            <Link to={`/${section}/x:QueuedMessage/${encoded}`} className="text-primary underline hover:no-underline">
              {encoded}
            </Link>
          );
        }
        return <span className="font-mono">{encoded}</span>;
      }

      const displayNum = typeof numericInput === 'number' ? numericInput : Number(numericInput);
      return <>{displayNum.toLocaleString()}</>;
    }
    case 'Boolean': {
      if (keyName === 'tls') {
        return <TlsBoolean on={value.value} />;
      }
      return <>{String(value.value)}</>;
    }
    case 'Float':
      return <>{value.value.toFixed(2)}</>;
    case 'UTCDateTime':
      return (
        <>
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'medium',
          }).format(new Date(value.value))}
        </>
      );
    case 'Duration': {
      const ms = value.value;
      if (ms < 1000) return <>{Math.round(ms)} ms</>;
      if (ms < 60_000) return <>{(ms / 1000).toFixed(1)} s</>;
      const m = Math.floor(ms / 60_000);
      const s = Math.floor((ms % 60_000) / 1000);
      return (
        <>
          {m} m {s} s
        </>
      );
    }
    case 'IpAddr':
      return <>{value.value}</>;
    case 'List': {
      if (value.value.length <= 3) {
        return (
          <>
            {value.value.map((v, i) => (
              <span key={i}>
                {i > 0 && ', '}
                <TraceValueDisplay
                  keyName={keyName}
                  value={v}
                  resolveKeyLabel={resolveKeyLabel}
                  resolveEventLabel={resolveEventLabel}
                  viewToSection={viewToSection}
                  depth={depth}
                />
              </span>
            ))}
          </>
        );
      }
      return (
        <div className="space-y-0.5">
          {value.value.map((v, i) => (
            <div key={i}>
              <TraceValueDisplay
                keyName={keyName}
                value={v}
                resolveKeyLabel={resolveKeyLabel}
                resolveEventLabel={resolveEventLabel}
                viewToSection={viewToSection}
                depth={depth}
              />
            </div>
          ))}
        </div>
      );
    }
    case 'Event': {
      if (depth >= 2) {
        return (
          <pre className="text-xs bg-muted/30 p-2 rounded whitespace-pre-wrap">
            {JSON.stringify({ event: value.event, values: value.value }, null, 2)}
          </pre>
        );
      }
      const { label, explanation } = resolveEventLabel(value.event);
      return (
        <div className="mt-1 border-l-2 border-muted pl-3 space-y-1">
          <div className="text-xs font-semibold">{label}</div>
          {explanation && <div className="text-xs text-muted-foreground">{explanation}</div>}
          {value.value.map((kv, i) => (
            <TraceKeyValueRow
              key={i}
              kv={kv}
              resolveKeyLabel={resolveKeyLabel}
              resolveEventLabel={resolveEventLabel}
              depth={depth + 1}
            />
          ))}
        </div>
      );
    }
    case 'Null':
      return <span className="text-muted-foreground">&mdash;</span>;
    default:
      return <>{JSON.stringify(value)}</>;
  }
}
