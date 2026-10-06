/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the server's 649 event types, grouped for picking (settings-reorg,
 * second wave). Names are "category.event"; the category is the group.
 */

import type { EnumVariant } from '@/types/schema';

const CATEGORY_NAMES: Record<string, string> = {
  acme: 'Certificates (ACME)',
  ai: 'AI',
  arc: 'ARC',
  auth: 'Sign-in',
  calendar: 'Calendar',
  cluster: 'Cluster',
  dane: 'DANE',
  delivery: 'Outgoing delivery',
  dkim: 'DKIM',
  dmarc: 'DMARC',
  dns: 'DNS',
  eval: 'Expressions',
  http: 'HTTP',
  imap: 'IMAP',
  'incoming-report': 'Reports received',
  iprev: 'Reverse DNS',
  jmap: 'JMAP',
  limit: 'Limits',
  'mail-auth': 'Mail authentication',
  'manage-sieve': 'ManageSieve',
  'message-ingest': 'Incoming messages',
  milter: 'Milters',
  'mta-hook': 'MTA hooks',
  'mta-sts': 'MTA-STS',
  network: 'Network',
  'outgoing-report': 'Reports sent',
  pop3: 'POP3',
  'push-subscription': 'Push',
  queue: 'Queue',
  registry: 'Settings',
  resource: 'Resources',
  scim: 'SCIM',
  security: 'Security',
  server: 'Server',
  sieve: 'Sieve',
  smtp: 'SMTP',
  spam: 'Spam filter',
  spf: 'SPF',
  store: 'Storage',
  'task-manager': 'Tasks',
  telemetry: 'Telemetry and alerts',
  tls: 'TLS',
  'tls-rpt': 'TLS reporting',
  'web-dav': 'WebDAV',
};

export function categoryOf(event: string): string {
  return event.split('.')[0];
}

export function categoryName(category: string): string {
  return CATEGORY_NAMES[category] ?? category;
}

export interface EventGroup {
  category: string;
  name: string;
  events: EnumVariant[];
}

/** Events grouped by category, groups in a readable order, optionally filtered by a search. */
export function groupEvents(variants: EnumVariant[], search = ''): EventGroup[] {
  const q = search.trim().toLowerCase();
  const groups = new Map<string, EnumVariant[]>();
  for (const v of variants) {
    if (
      q &&
      !v.name.toLowerCase().includes(q) &&
      !v.label.toLowerCase().includes(q) &&
      !(v.explanation ?? '').toLowerCase().includes(q) &&
      !categoryName(categoryOf(v.name)).toLowerCase().includes(q)
    ) {
      continue;
    }
    const c = categoryOf(v.name);
    groups.set(c, [...(groups.get(c) ?? []), v]);
  }
  return [...groups.entries()]
    .map(([category, events]) => ({ category, name: categoryName(category), events }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface CommonPick {
  id: string;
  name: string;
  hint: string;
  events: string[];
}

export const COMMON_PICKS: CommonPick[] = [
  {
    id: 'delivery',
    name: 'Delivery results',
    hint: 'A message was delivered, delayed or bounced.',
    events: [
      'delivery.delivered',
      'delivery.dsn-success',
      'delivery.dsn-temp-fail',
      'delivery.dsn-perm-fail',
      'delivery.double-bounce',
    ],
  },
  {
    id: 'security',
    name: 'Failed sign-ins and bans',
    hint: 'Wrong passwords, and addresses the server blocked.',
    events: [
      'auth.failed',
      'auth.too-many-attempts',
      'security.authentication-ban',
      'security.abuse-ban',
      'security.scan-ban',
      'security.ip-blocked',
    ],
  },
  {
    id: 'alerts',
    name: 'Alerts',
    hint: 'An alert fired (Monitoring › Alerts), as an event or an email.',
    events: ['telemetry.alert-event', 'telemetry.alert-message'],
  },
  {
    id: 'spam',
    name: 'Spam verdicts',
    hint: 'An incoming message was filed as spam or as not spam.',
    events: ['message-ingest.spam', 'message-ingest.ham'],
  },
  {
    id: 'certificates',
    name: 'Certificates',
    hint: 'A certificate was issued, or ordering one failed.',
    events: ['acme.order-completed', 'acme.order-invalid', 'acme.error'],
  },
];

/** The shape of what the server posts, for the example (trc/src/serializers/json.rs). */
export const EXAMPLE_BODY = `{
  "events": [
    {
      "id": "17906227430001234",
      "createdAt": "2026-09-28T20:15:24Z",
      "type": "auth.failed",
      "data": { "…": "the event's own details, which vary by event" }
    }
  ]
}`;
