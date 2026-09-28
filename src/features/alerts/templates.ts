/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: alerts people actually want, as templates (settings-reorg, second
 * wave). How alerts behave (monitoring spec MON-25 to MON-29): the condition
 * is checked every minute and the alert fires when it turns true, then again
 * only after it has been false. Gauges (the queue, memory) go back down, so
 * those alerts re-arm. Counters are totals since the server started, so a
 * counter alert ("> 0") fires once, the first time it happens, and not again
 * until a restart: right for rare, serious events, wrong for rates, which is
 * why no template watches a rate.
 */

export interface AlertTemplate {
  id: string;
  title: string;
  /** When it fires, in words. */
  when: (n: number) => string;
  /** A threshold to ask for, if the template takes one. */
  threshold?: { label: string; unit: string; value: number; toMetric?: (n: number) => number };
  condition: (n: number) => string;
  subject: string;
  body: string;
}

const MB = 1024 * 1024;

const STORE_ERRORS = [
  'store.data-corruption',
  'store.rocksdb-error',
  'store.sqlite-error',
  'store.postgresql-error',
  'store.mysql-error',
  'store.foundationdb-error',
  'store.s3-error',
  'store.azure-error',
  'store.filesystem-error',
];

const sum = (metrics: string[]) => metrics.map((m) => `metric('${m}')`).join(' + ');

export const TEMPLATES: AlertTemplate[] = [
  {
    id: 'queue',
    title: 'The queue is backing up',
    when: (n) => `more than ${n} messages are waiting to be delivered`,
    threshold: { label: 'Messages waiting', unit: 'messages', value: 500 },
    condition: (n) => `metric('queue.count') > ${n}`,
    subject: 'Mail queue: %{queue.count}% messages waiting',
    body:
      'The outgoing mail queue holds %{queue.count}% messages.\n\n' +
      'Open Management › Emails › Queued in the console to see what is waiting and why.\n',
  },
  {
    id: 'memory',
    title: 'Memory is running high',
    when: (n) => `the server uses more than ${n} MB of memory`,
    threshold: { label: 'Memory', unit: 'MB', value: 2048, toMetric: (n) => n * MB },
    condition: (n) => `metric('server.memory') > ${n}`,
    subject: 'Mail server memory: %{server.memory}% bytes',
    body: 'The mail server is using %{server.memory}% bytes of memory, above the limit you set.\n',
  },
  {
    id: 'certificates',
    title: 'Certificate renewal failed',
    when: () => 'renewing a certificate fails for the first time since the server started',
    condition: () => sum(['acme.order-invalid', 'acme.auth-error', 'acme.error']) + ' > 0',
    subject: 'Certificate renewal failed',
    body:
      'A certificate order or renewal failed on the mail server.\n\n' +
      'Open Management › Tasks › Failed in the console for the reason. The current certificate keeps working until it expires.\n',
  },
  {
    id: 'storage',
    title: 'The data store reported an error',
    when: () => 'the data store reports an error for the first time since the server started',
    condition: () => sum(STORE_ERRORS) + ' > 0',
    subject: 'Mail server storage error',
    body: 'The mail server’s data store reported an error. Check the server logs, and the disk or database behind it.\n',
  },
  {
    id: 'dns',
    title: 'Publishing DNS records failed',
    when: () => 'writing DNS records to your DNS provider fails for the first time since the server started',
    condition: () => sum(['dns.record-creation-failed', 'dns.record-deletion-failed']) + ' > 0',
    subject: 'DNS publishing failed',
    body:
      'The mail server could not write a DNS record at your DNS provider.\n\n' +
      'The API key may have expired or lost access. Open the domain in the console to check its DNS.\n',
  },
];

export function templateCondition(t: AlertTemplate, n: number): string {
  return t.condition(t.threshold?.toMetric ? t.threshold.toMetric(n) : n);
}

/** Which template, and threshold, an alert's condition came from. */
export function recognize(condition: string): { template: AlertTemplate; n: number } | null {
  const c = condition.replace(/\s+/g, ' ').trim();
  for (const t of TEMPLATES) {
    if (!t.threshold) {
      if (c === t.condition(0).replace(/\s+/g, ' ').trim()) return { template: t, n: 0 };
      continue;
    }
    const [head] = t.condition(0).split('> ');
    if (c.startsWith(head) && /> \d+$/.test(c)) {
      const raw = Number(c.slice(head.length).replace('> ', ''));
      const n = t.threshold.toMetric ? Math.round(raw / t.threshold.toMetric(1)) : raw;
      return { template: t, n };
    }
  }
  return null;
}

export interface AlertRecord {
  id?: string;
  enable?: boolean;
  condition?: { match?: Record<string, unknown>; else?: string };
  emailAlert?: { '@type'?: string; to?: Record<string, boolean>; subject?: string };
  eventAlert?: { '@type'?: string };
}

/** An alert as a sentence: "When more than 500 messages are waiting, email ops@example.org." */
export function describeAlert(a: AlertRecord): string {
  const cond = a.condition ?? {};
  const plain = Object.keys(cond.match ?? {}).length === 0 ? (cond.else ?? '') : null;
  const known = plain !== null ? recognize(plain) : null;
  const when = known
    ? known.template.when(known.n)
    : plain
      ? `the condition ${plain} is true`
      : 'its condition is true';
  const actions: string[] = [];
  if (a.emailAlert?.['@type'] === 'Enabled') {
    actions.push(`email ${Object.keys(a.emailAlert.to ?? {}).join(', ') || 'nobody'}`);
  }
  if (a.eventAlert?.['@type'] === 'Enabled') actions.push('raise an event for webhooks');
  const does = actions.length > 0 ? actions.join(' and ') : 'do nothing (no email or event is set)';
  return `When ${when}, ${does}.${a.enable === false ? ' (off)' : ''}`;
}
