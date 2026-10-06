/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the standard mail ports as services (settings-reorg, second wave).
 * A listener is one x:NetworkListener: a protocol, the addresses it binds
 * and how TLS is used. The table sorts them into the services people know
 * by their port; anything else is a custom listener, left as it is.
 *
 * IMAP, POP3 and ManageSieve (and, when legacy mail is off entirely, the
 * sending ports) belong to Security › Hardening, whose switches take their
 * listeners away and put them back (legacy-protocols spec). The table
 * shows their state and points there instead of switching them itself.
 */

export type ServiceId =
  'smtp' | 'submission' | 'submissions' | 'https' | 'http' | 'imaps' | 'imap' | 'pop3s' | 'pop3' | 'sieve';

export interface Service {
  id: ServiceId;
  port: number;
  protocol: string;
  implicitTls: boolean;
  /** Whether STARTTLS is offered (useTls without implicit TLS). */
  useTls: boolean;
  group: 'receive' | 'send' | 'web' | 'read';
  /** Switched on Hardening, not here. */
  hardening?: boolean;
  /** Turning it off breaks something people rely on: ask first. */
  critical?: string;
}

export const SERVICES: Service[] = [
  {
    id: 'smtp',
    port: 25,
    protocol: 'smtp',
    implicitTls: false,
    useTls: true,
    group: 'receive',
    critical: 'Other servers can no longer deliver mail to you.',
  },
  { id: 'submission', port: 587, protocol: 'smtp', implicitTls: false, useTls: true, group: 'send' },
  { id: 'submissions', port: 465, protocol: 'smtp', implicitTls: true, useTls: true, group: 'send' },
  {
    id: 'https',
    port: 443,
    protocol: 'http',
    implicitTls: true,
    useTls: true,
    group: 'web',
    critical: 'The webmail, this console, JMAP apps and automatic setup stop working.',
  },
  { id: 'http', port: 80, protocol: 'http', implicitTls: false, useTls: false, group: 'web' },
  { id: 'imaps', port: 993, protocol: 'imap', implicitTls: true, useTls: true, group: 'read', hardening: true },
  { id: 'imap', port: 143, protocol: 'imap', implicitTls: false, useTls: true, group: 'read', hardening: true },
  { id: 'pop3s', port: 995, protocol: 'pop3', implicitTls: true, useTls: true, group: 'read', hardening: true },
  { id: 'pop3', port: 110, protocol: 'pop3', implicitTls: false, useTls: true, group: 'read', hardening: true },
  {
    id: 'sieve',
    port: 4190,
    protocol: 'manageSieve',
    implicitTls: false,
    useTls: true,
    group: 'read',
    hardening: true,
  },
];

export interface ListenerRecord {
  id: string;
  name?: string;
  protocol?: string;
  bind?: Record<string, boolean>;
  tlsImplicit?: boolean;
  useTls?: boolean;
}

/** The port of a socket address: "[::]:25", "0.0.0.0:587", "127.0.0.1:8080". */
export function portOf(address: string): number | null {
  const m = /:(\d+)$/.exec(address.trim());
  return m ? Number(m[1]) : null;
}

export function portsOf(l: ListenerRecord): number[] {
  return Object.keys(l.bind ?? {})
    .map(portOf)
    .filter((p): p is number => p !== null);
}

/** Which listeners serve which standard service, and which are custom. */
export function classify(listeners: ListenerRecord[]): {
  byService: Map<ServiceId, ListenerRecord[]>;
  custom: ListenerRecord[];
} {
  const byService = new Map<ServiceId, ListenerRecord[]>();
  const custom: ListenerRecord[] = [];
  for (const l of listeners) {
    const ports = portsOf(l);
    const s = SERVICES.find((x) => x.protocol === (l.protocol ?? 'smtp') && ports.includes(x.port));
    if (s) byService.set(s.id, [...(byService.get(s.id) ?? []), l]);
    else custom.push(l);
  }
  return { byService, custom };
}

/** A new listener for a standard service, on every address. */
export function listenerFor(s: Service): Record<string, unknown> {
  return {
    name: s.id,
    protocol: s.protocol,
    bind: { [`[::]:${s.port}`]: true },
    tlsImplicit: s.implicitTls,
    useTls: s.useTls,
  };
}

export function encryptionWords(l: { tlsImplicit?: boolean; useTls?: boolean }): string {
  if (l.tlsImplicit) return 'encrypted from the start';
  if (l.useTls === false) return 'not encrypted';
  return 'STARTTLS';
}
