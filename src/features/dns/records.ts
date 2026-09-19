/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { RecordKind } from './zone';

export interface RecordGroup {
  id: string;
  title: string;
  why: string;
  kinds: { kind: RecordKind; label: string; caution?: string }[];
}

/**
 * The record types, grouped by what they do for you rather than by
 * their DNS type. The labels say what switching one on achieves.
 */
export const RECORD_GROUPS: RecordGroup[] = [
  {
    id: 'deliver',
    title: 'Receive mail',
    why: 'Tells the rest of the internet where mail for this domain goes.',
    kinds: [{ kind: 'mx', label: 'Mail exchanger (MX)' }],
  },
  {
    id: 'trust',
    title: 'Prove mail is really yours',
    why: 'Without these, big providers send your mail to spam or refuse it.',
    kinds: [
      { kind: 'spf', label: 'Allowed senders (SPF)' },
      { kind: 'dkim', label: 'Signing keys (DKIM)' },
      { kind: 'dmarc', label: 'What to do with fakes (DMARC)' },
    ],
  },
  {
    id: 'secure',
    title: 'Keep mail encrypted on the way',
    why: 'Asks other servers to only deliver to you over a verified, encrypted connection, and to report when they can’t.',
    kinds: [
      { kind: 'mtaSts', label: 'Require encryption (MTA-STS)' },
      { kind: 'tlsRpt', label: 'Encryption failure reports (TLS-RPT)' },
      {
        kind: 'tlsa',
        label: 'Certificate pinning (DANE / TLSA)',
        caution: 'Only useful when the zone is signed with DNSSEC. Leave off unless you know it is.',
      },
    ],
  },
  {
    id: 'apps',
    title: 'Let mail apps set themselves up',
    why: 'People type their address and password; Thunderbird, Apple Mail, Outlook and phones find the rest.',
    kinds: [
      { kind: 'srv', label: 'Service records (SRV)' },
      { kind: 'autoConfig', label: 'Autoconfig' },
      { kind: 'autoConfigLegacy', label: 'Thunderbird autoconfig' },
      { kind: 'autoDiscover', label: 'Outlook autodiscover' },
    ],
  },
  {
    id: 'certs',
    title: 'Limit who can issue certificates',
    why: 'Names the certificate authorities allowed to issue for this domain.',
    kinds: [{ kind: 'caa', label: 'Certificate authorities (CAA)' }],
  },
];

/** The guided default: everything but TLSA, which needs DNSSEC to mean anything. */
export const DEFAULT_KINDS: RecordKind[] = RECORD_GROUPS.flatMap((g) => g.kinds.map((k) => k.kind)).filter(
  (k) => k !== 'tlsa',
);
