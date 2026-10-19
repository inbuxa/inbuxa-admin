/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The steps the server's live delivery stream reports (`/api/live/delivery`),
 * by their names on the wire. Each step starts, then ends in Success, Error
 * or, for the optional lookups, NotFound; `elapsed` is in milliseconds.
 */
export type DeliveryStage =
  // Lookups for the recipient's domain.
  | { type: 'mxLookupStart'; domain: string }
  | { type: 'mxLookupSuccess'; mxs: MX[]; elapsed: number }
  | { type: 'mxLookupError'; reason: string; elapsed: number }
  | { type: 'mtaStsFetchStart' }
  | { type: 'mtaStsFetchSuccess'; policy: Policy; elapsed: number }
  | { type: 'mtaStsFetchError'; reason: string; elapsed: number }
  | { type: 'mtaStsNotFound'; elapsed: number }
  | { type: 'tlsRptLookupStart' }
  | { type: 'tlsRptLookupSuccess'; rua: ReportUri[]; elapsed: number }
  | { type: 'tlsRptLookupError'; reason: string; elapsed: number }
  | { type: 'tlsRptNotFound'; elapsed: number }
  // Then, per MX host tried:
  | { type: 'deliveryAttemptStart'; hostname: string }
  | { type: 'mtaStsVerifySuccess' }
  | { type: 'mtaStsVerifyError'; reason: string }
  | { type: 'tlsaLookupStart' }
  | { type: 'tlsaLookupSuccess'; record: Tlsa; elapsed: number }
  | { type: 'tlsaNotFound'; elapsed: number; reason: string }
  | { type: 'tlsaLookupError'; elapsed: number; reason: string }
  | { type: 'ipLookupStart' }
  | { type: 'ipLookupSuccess'; remoteIps: string[]; elapsed: number }
  | { type: 'ipLookupError'; reason: string; elapsed: number }
  | { type: 'connectionStart'; remoteIp: string }
  | { type: 'connectionSuccess'; elapsed: number }
  | { type: 'connectionError'; elapsed: number; reason: string }
  | { type: 'readGreetingStart' }
  | { type: 'readGreetingSuccess'; elapsed: number }
  | { type: 'readGreetingError'; elapsed: number; reason: string }
  | { type: 'ehloStart' }
  | { type: 'ehloSuccess'; elapsed: number }
  | { type: 'ehloError'; elapsed: number; reason: string }
  | { type: 'startTlsStart' }
  | { type: 'startTlsSuccess'; elapsed: number }
  | { type: 'startTlsError'; elapsed: number; reason: string }
  | { type: 'daneVerifySuccess' }
  | { type: 'daneVerifyError'; reason: string }
  | { type: 'mailFromStart' }
  | { type: 'mailFromSuccess'; elapsed: number }
  | { type: 'mailFromError'; reason: string; elapsed: number }
  | { type: 'rcptToStart' }
  | { type: 'rcptToSuccess'; elapsed: number }
  | { type: 'rcptToError'; reason: string; elapsed: number }
  | { type: 'quitStart' }
  | { type: 'quitCompleted'; elapsed: number }
  // The end of the stream.
  | { type: 'completed' };

/** MX hosts that share a preference. */
export interface MX {
  exchanges: string[];
  preference: number;
}

/** Where a domain wants TLS reports sent (RFC 8460). */
export type ReportUri = { type: 'mail'; email: string } | { type: 'http'; url: string };

/** The MTA-STS policy and the TLSA record, shown as the server sends them. */
export type Policy = Record<string, unknown>;
export type Tlsa = Record<string, unknown>;
