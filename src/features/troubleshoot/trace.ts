/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The delivery trace without the page: how the server's stream of steps
 * becomes rows, attempts, labels and an outcome, and the states a trace
 * goes through.
 */
import type { DeliveryStage } from './types';

export type StageSeverity = 'pending' | 'ok' | 'warn' | 'error';

/** `t` with an English default, as the console calls it. */
type Translate = (key: string, fallback: string, options?: Record<string, unknown>) => string;

/** A step that has started and not finished is pending; the server names the rest by how they ended. */
export function stageSeverity({ type }: DeliveryStage): StageSeverity {
  if (type === 'completed' || type === 'deliveryAttemptStart') return 'ok';
  if (type.endsWith('Error')) return 'error';
  if (type.endsWith('NotFound')) return 'warn';
  if (type.endsWith('Start')) return 'pending';
  return 'ok';
}

/** The steps, by the prefix their stage names share, and how each is named. SMTP commands keep their own names. */
const STEPS: [prefix: string, name: (t: Translate) => string][] = [
  ['mxLookup', (t) => t('deliveryTrace.phase.mxLookup', 'MX Lookup')],
  ['mtaStsFetch', (t) => t('deliveryTrace.phase.mtaStsFetch', 'MTA-STS Policy Fetch')],
  ['tlsRptLookup', (t) => t('deliveryTrace.phase.tlsRptLookup', 'TLS-RPT Lookup')],
  ['mtaStsVerify', (t) => t('deliveryTrace.phase.mtaStsVerify', 'MTA-STS Verify')],
  ['tlsaLookup', (t) => t('deliveryTrace.phase.tlsaLookup', 'TLSA / DANE Lookup')],
  ['ipLookup', (t) => t('deliveryTrace.phase.ipLookup', 'IP Lookup')],
  ['connection', (t) => t('deliveryTrace.phase.connection', 'TCP Connection')],
  ['readGreeting', (t) => t('deliveryTrace.phase.readGreeting', 'Read Greeting')],
  ['ehlo', () => 'EHLO'],
  ['startTls', () => 'STARTTLS'],
  ['daneVerify', (t) => t('deliveryTrace.phase.daneVerify', 'DANE Verify')],
  ['mailFrom', () => 'MAIL FROM'],
  ['rcptTo', () => 'RCPT TO'],
  ['quit', () => 'QUIT'],
];

/** The three lookups that can find nothing name that outcome after the step. */
const NOT_FOUND: Record<string, string> = {
  mtaStsNotFound: 'mtaStsFetch',
  tlsRptNotFound: 'tlsRptLookup',
  tlsaNotFound: 'tlsaLookup',
};

function stepOf(stage: DeliveryStage) {
  const prefix = NOT_FOUND[stage.type] ?? stage.type;
  return STEPS.find(([p]) => prefix.startsWith(p));
}

/** Which step a stage belongs to, so its outcome can take the place of its start. */
function stepKey(stage: DeliveryStage): string {
  if (stage.type === 'deliveryAttemptStart') return `attempt-${stage.hostname}`;
  return stepOf(stage)?.[0] ?? stage.type;
}

/**
 * One row per step: a step's outcome replaces its start where the start
 * was, so a row shows a spinner until the step ends, then how it went.
 */
export function pairStages(stages: DeliveryStage[]): DeliveryStage[] {
  const rows: DeliveryStage[] = [];
  const open = new Map<string, number>();
  for (const stage of stages) {
    const key = stepKey(stage);
    const at = open.get(key);
    if (stageSeverity(stage) === 'pending') {
      open.set(key, rows.length);
      rows.push(stage);
    } else if (at !== undefined) {
      rows[at] = stage;
      open.delete(key);
    } else {
      rows.push(stage);
    }
  }
  return rows;
}

export interface AttemptGroup {
  /** The attempt's own row, or null for the lookups before the first attempt. */
  attempt: DeliveryStage | null;
  events: DeliveryStage[];
}

/** The rows split by delivery attempt, each attempt with the steps it ran. */
export function byAttempt(rows: DeliveryStage[]): AttemptGroup[] {
  const groups: AttemptGroup[] = [];
  for (const row of rows) {
    if (row.type === 'deliveryAttemptStart') groups.push({ attempt: row, events: [] });
    else if (groups.length === 0) groups.push({ attempt: null, events: [row] });
    else groups[groups.length - 1].events.push(row);
  }
  return groups;
}

/** How many hosts were tried, and whether one took the message. */
export function outcome(rows: DeliveryStage[]) {
  return {
    attempts: rows.filter((r) => r.type === 'deliveryAttemptStart').length,
    delivered: rows.at(-1)?.type === 'quitCompleted' || rows.some((r) => r.type === 'rcptToSuccess'),
  };
}

export function stageLabel(t: Translate, stage: DeliveryStage): string {
  if (stage.type === 'deliveryAttemptStart') {
    return t('deliveryTrace.attemptLabel', 'Delivery Attempt: {{hostname}}', { hostname: stage.hostname });
  }
  const step = stepOf(stage);
  return step ? step[1](t) : stage.type;
}

/** What a step that ended well found or did. */
const DONE: Partial<Record<DeliveryStage['type'], (t: Translate) => string>> = {
  mtaStsFetchSuccess: (t) => t('deliveryTrace.body.mtaStsFetchSuccess', 'Policy fetched successfully'),
  mtaStsNotFound: (t) => t('deliveryTrace.body.mtaStsNotFound', 'No MTA-STS policy published'),
  tlsRptNotFound: (t) => t('deliveryTrace.body.tlsRptNotFound', 'No TLS-RPT record published'),
  connectionSuccess: (t) => t('deliveryTrace.body.connectionSuccess', 'Connected'),
  tlsaLookupSuccess: (t) => t('deliveryTrace.body.tlsaLookupSuccess', 'TLSA record found'),
  readGreetingSuccess: (t) => t('deliveryTrace.body.readGreetingSuccess', 'Server greeting received'),
  ehloSuccess: (t) => t('deliveryTrace.body.ehloSuccess', 'EHLO accepted'),
  startTlsSuccess: (t) => t('deliveryTrace.body.startTlsSuccess', 'TLS negotiated'),
  daneVerifySuccess: (t) => t('deliveryTrace.body.daneVerifySuccess', 'DANE verification passed'),
  mtaStsVerifySuccess: (t) => t('deliveryTrace.body.mtaStsVerifySuccess', 'MTA-STS hostname verified'),
  mailFromSuccess: (t) => t('deliveryTrace.body.mailFromSuccess', 'Sender accepted'),
  rcptToSuccess: (t) => t('deliveryTrace.body.rcptToSuccess', 'Recipient accepted'),
  quitCompleted: (t) => t('deliveryTrace.body.quitCompleted', 'Session closed'),
};

/** The line under a step's name: what it found, or why it failed; null for steps with nothing to add. */
export function stageDetail(t: Translate, stage: DeliveryStage): string | null {
  switch (stage.type) {
    case 'mxLookupStart':
      return t('deliveryTrace.body.mxLookupStart', 'Looking up MX for {{domain}}', { domain: stage.domain });
    case 'mxLookupSuccess': {
      const hosts = stage.mxs.reduce((n, mx) => n + mx.exchanges.length, 0);
      return hosts === 1
        ? t('deliveryTrace.body.mxLookupSuccess_one', 'Resolved {{count}} MX record', { count: hosts })
        : t('deliveryTrace.body.mxLookupSuccess_other', 'Resolved {{count}} MX records', { count: hosts });
    }
    case 'tlsRptLookupSuccess': {
      const count = stage.rua.length;
      return count === 1
        ? t('deliveryTrace.body.tlsRptLookupSuccess_one', 'Found {{count}} reporting URI', { count })
        : t('deliveryTrace.body.tlsRptLookupSuccess_other', 'Found {{count}} reporting URIs', { count });
    }
    case 'ipLookupSuccess': {
      const ips = stage.remoteIps;
      if (ips.length <= 3) return ips.join(', ');
      return t('deliveryTrace.body.ipLookupOverflow', '{{shown}} +{{extra}} more', {
        shown: ips.slice(0, 3).join(', '),
        extra: ips.length - 3,
      });
    }
    case 'connectionStart':
      return t('deliveryTrace.body.connectionStart', 'Connecting to {{ip}}', { ip: stage.remoteIp });
    case 'tlsaNotFound':
      return stage.reason || t('deliveryTrace.body.tlsaNotFound', 'No TLSA record found');
  }
  const done = DONE[stage.type];
  if (done) return done(t);
  return 'reason' in stage && typeof stage.reason === 'string' ? stage.reason : null;
}

export function formatElapsed(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export type TraceState =
  | { kind: 'idle' }
  | { kind: 'starting'; target: string }
  | { kind: 'running'; target: string; startedAt: number; events: DeliveryStage[] }
  | { kind: 'completed'; target: string; startedAt: number; completedAt: number; events: DeliveryStage[] }
  | { kind: 'failed'; target: string; events: DeliveryStage[]; error: string };

export type TraceAction =
  | { type: 'start'; target: string }
  /** The stream is open; `at` is when the trace began. */
  | { type: 'opened'; at: number }
  | { type: 'stages'; stages: DeliveryStage[]; at: number }
  | { type: 'failed'; error: string }
  | { type: 'reset' };

/** A trace's life: the form, starting, streaming steps, then completed or failed. */
export function traceReducer(state: TraceState, action: TraceAction): TraceState {
  switch (action.type) {
    case 'start':
      return { kind: 'starting', target: action.target };
    case 'reset':
      return { kind: 'idle' };
    case 'opened':
      return state.kind === 'starting'
        ? { kind: 'running', target: state.target, startedAt: action.at, events: [] }
        : state;
    case 'stages': {
      if (state.kind !== 'running' && state.kind !== 'starting') return state;
      const startedAt = state.kind === 'running' ? state.startedAt : action.at;
      const events = state.kind === 'running' ? [...state.events] : [];
      for (const stage of action.stages) {
        // The server ends the stream with `completed`; anything after it is ignored.
        if (stage.type === 'completed') {
          return { kind: 'completed', target: state.target, startedAt, completedAt: action.at, events };
        }
        events.push(stage);
      }
      return { kind: 'running', target: state.target, startedAt, events };
    }
    case 'failed':
      if (state.kind !== 'running' && state.kind !== 'starting') return state;
      return {
        kind: 'failed',
        target: state.target,
        events: state.kind === 'running' ? state.events : [],
        error: action.error,
      };
  }
}
