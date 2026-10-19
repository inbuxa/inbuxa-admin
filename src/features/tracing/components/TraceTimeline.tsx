/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CircleDot, CircleX, Clock } from 'lucide-react';
import { ExplainButton } from '@/features/ai/explain/ExplainButton';
import { isRawEvent, type ExplainSubject } from '@/features/ai/explain/explain';
import { useSchemaStore } from '@/stores/schemaStore';
import { eventTone, idToText, isIdKey, offsetFrom, shortDuration } from '../format';
import type { TraceEvent, TraceKeyValue, TraceValue } from '../types';

/** How close to the bottom counts as "at the bottom", so new events keep it scrolled there. */
const STICK_PX = 50;

interface EventName {
  label: string;
  explanation?: string;
  /** False for an event type the schema doesn't name; it shows as its raw name. */
  known: boolean;
}

/** People's names for event types and keys, from the schema's EventType and Key enums. */
interface Names {
  event: (type: string) => EventName;
  key: (key: string) => string;
  /** The section the queued-message pages live in, for queue id links. */
  queueSection: string;
}

function useNames(): Names {
  const schema = useSchemaStore((s) => s.schema);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  return useMemo(() => {
    const events = new Map((schema?.enums?.EventType ?? []).map((e) => [e.name, e]));
    const keys = new Map((schema?.enums?.Key ?? []).map((e) => [e.name, e.label]));
    return {
      event: (type) => {
        const entry = events.get(type);
        return entry
          ? { label: entry.label, explanation: entry.explanation, known: true }
          : { label: type, known: false };
      },
      key: (key) => keys.get(key) ?? key,
      queueSection: viewToSection['x:QueuedMessage'] ?? 'Management',
    };
  }, [schema, viewToSection]);
}

const TONE_ICON = {
  error: <CircleX className="h-4 w-4 text-red-500" />,
  span: <Clock className="h-4 w-4 text-muted-foreground" />,
  plain: <CircleDot className="h-4 w-4 text-muted-foreground" />,
};

const clockTime = (timestamp: string) =>
  new Date(timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  });

interface TraceTimelineProps {
  events: TraceEvent[];
  /** What the offsets count from; the first event's time when absent. */
  anchorTimestamp?: string;
  /** What "Explain this" asks about an event (ai-explain EX-17); no button without it. */
  explainSubject?: (event: TraceEvent, index: number) => ExplainSubject;
}

/** A trace's events in order, each with its time, its offset from the anchor and its values. */
export function TraceTimeline({ events, anchorTimestamp, explainSubject }: TraceTimelineProps) {
  const { t } = useTranslation();
  const names = useNames();
  const scroller = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);

  // Follow new events, unless the reader has scrolled up to look at older ones.
  useEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [events.length]);

  if (events.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        {t('tracing.noEvents', 'No trace events to display.')}
      </div>
    );
  }

  const anchorMs = Date.parse(anchorTimestamp || events[0].timestamp);

  return (
    <div className="relative">
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_PX;
        }}
        className="max-h-[70vh] overflow-y-auto scroll-smooth"
      >
        <div className="space-y-4 p-2">
          {events.map((event, index) => {
            const name = names.event(event.event);
            return (
              <div key={index} className="flex gap-3">
                <div className="mt-1 shrink-0">{TONE_ICON[eventTone(event.event)]}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      {name.known ? (
                        <span className="text-sm font-semibold">{name.label}</span>
                      ) : (
                        <span className="font-mono text-sm bg-muted px-1.5 py-0.5 rounded">{name.label}</span>
                      )}
                      {name.explanation && <p className="text-xs text-muted-foreground mt-0.5">{name.explanation}</p>}
                    </div>
                    <div className="flex shrink-0 items-start gap-2">
                      {/* Raw protocol traffic isn't sent to the model (EX-9). */}
                      {explainSubject && !isRawEvent(event.event) && (
                        <ExplainButton
                          icon
                          className="mt-0.5"
                          title={name.label}
                          subject={() => explainSubject(event, index)}
                        />
                      )}
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{clockTime(event.timestamp)}</div>
                        <div className="text-xs text-muted-foreground/60">{offsetFrom(anchorMs, event.timestamp)}</div>
                      </div>
                    </div>
                  </div>
                  {event.keyValues.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {event.keyValues.map((kv, i) => (
                        <ValueRow key={i} kv={kv} names={names} depth={0} />
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

interface ValueProps {
  names: Names;
  /** How deep in nested events this is; past two levels, an event shows as JSON. */
  depth: number;
}

function ValueRow({ kv, names, depth }: ValueProps & { kv: TraceKeyValue }) {
  return (
    <div className="flex gap-2 text-sm" style={{ paddingLeft: depth * 16 }}>
      <span className="shrink-0 text-muted-foreground text-xs min-w-24 text-right pt-0.5">{names.key(kv.key)}</span>
      <span className="text-xs pt-0.5">
        <Value keyName={kv.key} value={kv.value} names={names} depth={depth} />
      </span>
    </div>
  );
}

/** Very large integers can arrive wrapped as `{ source: "<digits>" }`. */
function integerOf(raw: unknown): number | string {
  return raw !== null && typeof raw === 'object' && 'source' in raw ? String(raw.source) : (raw as number);
}

function Value({ keyName, value, names, depth }: ValueProps & { keyName: string; value: TraceValue }): ReactNode {
  const { t } = useTranslation();
  switch (value['@type']) {
    case 'String':
    case 'IpAddr':
      return value.value;
    case 'UnsignedInt':
    case 'Integer': {
      const n = integerOf(value.value);
      if (!isIdKey(keyName)) return Number(n).toLocaleString();
      const id = idToText(n);
      if (keyName !== 'queueId') return <span className="font-mono">{id}</span>;
      return (
        <Link to={`/${names.queueSection}/x:QueuedMessage/${id}`} className="text-primary underline hover:no-underline">
          {id}
        </Link>
      );
    }
    case 'Boolean':
      if (keyName !== 'tls') return String(value.value);
      return value.value ? t('tracing.enabled', 'enabled') : t('tracing.disabled', 'disabled');
    case 'Float':
      return value.value.toFixed(2);
    case 'UTCDateTime':
      return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'medium' }).format(
        new Date(value.value),
      );
    case 'Duration':
      return shortDuration(value.value);
    case 'List': {
      const items = value.value.map((item, i) => (
        <Value key={i} keyName={keyName} value={item} names={names} depth={depth} />
      ));
      // Up to three on one line, more one per line.
      if (items.length <= 3)
        return items.map((item, i) => (
          <span key={i}>
            {i > 0 && ', '}
            {item}
          </span>
        ));
      return (
        <div className="space-y-0.5">
          {items.map((item, i) => (
            <div key={i}>{item}</div>
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
      const name = names.event(value.event);
      return (
        <div className="mt-1 border-l-2 border-muted pl-3 space-y-1">
          <div className="text-xs font-semibold">{name.label}</div>
          {name.explanation && <div className="text-xs text-muted-foreground">{name.explanation}</div>}
          {value.value.map((kv, i) => (
            <ValueRow key={i} kv={kv} names={names} depth={depth + 1} />
          ))}
        </div>
      );
    }
    case 'Null':
      return <span className="text-muted-foreground">&mdash;</span>;
    default:
      return JSON.stringify(value);
  }
}
