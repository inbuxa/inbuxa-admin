/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the DMARC and TLS reports other mail servers send about our
 * domains (admin UX roadmap, item 6). The server stores each one parsed, as
 * x:DmarcExternalReport / x:TlsExternalReport; they expire on their own, so
 * reading all of them stays small.
 */

import { getAccountId, jmapRequest } from '@/services/jmap/client';

/** At most this many of each kind are read; the newest ones win. */
export const REPORT_LIMIT = 500;

/** The server sends an objectList as a map keyed by index ("0", "1", …); read it with jmapMapToArray. */
export type JmapList<T> = T[] | Record<string, T>;

export type DmarcResult = 'pass' | 'fail' | 'unspecified';
export type Disposition = 'none' | 'pass' | 'quarantine' | 'reject' | 'unspecified';

export interface DmarcRecord {
  sourceIp?: string | null;
  count: number;
  headerFrom: string;
  envelopeFrom?: string;
  evaluatedDisposition: Disposition;
  evaluatedDkim: DmarcResult;
  evaluatedSpf: DmarcResult;
  dkimResults?: JmapList<{ domain: string; selector?: string; result: string }>;
  spfResults?: JmapList<{ domain: string; result: string }>;
}

export interface DmarcReport {
  orgName: string;
  dateRangeBegin: string;
  dateRangeEnd: string;
  policyDomain: string;
  policyDisposition?: string;
  policyTestingMode?: boolean;
  records: JmapList<DmarcRecord>;
}

export interface DmarcExternalReport {
  id: string;
  receivedAt: string;
  report: DmarcReport;
}

export interface TlsFailure {
  resultType?: string;
  failureReasonCode?: string | null;
  receivingMxHostname?: string | null;
  failedSessionCount: number;
}

export interface TlsPolicy {
  policyDomain: string;
  policyType?: string;
  totalSuccessfulSessions: number;
  totalFailedSessions: number;
  failureDetails?: JmapList<TlsFailure>;
}

export interface TlsExternalReport {
  id: string;
  receivedAt: string;
  report: {
    organizationName?: string | null;
    dateRangeStart: string;
    dateRangeEnd: string;
    policies: JmapList<TlsPolicy>;
  };
}

async function readAll<T>(object: string): Promise<T[]> {
  const accountId = getAccountId(object);
  const responses = await jmapRequest([
    [`${object}/query`, { accountId }, 'q'],
    [
      `${object}/get`,
      {
        accountId,
        '#ids': { resultOf: 'q', name: `${object}/query`, path: '/ids' },
        properties: ['receivedAt', 'report'],
      },
      'g',
    ],
  ]);
  const got = responses.find(([name]) => name === `${object}/get`);
  if (!got) {
    const failed = responses[0]?.[1] as { description?: string; type?: string } | undefined;
    throw new Error(failed?.description ?? failed?.type ?? 'Request failed');
  }
  const list = ((got[1] as { list?: T[] }).list ?? []) as (T & { receivedAt: string })[];
  return list.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt)).slice(0, REPORT_LIMIT);
}

export const fetchDmarcReports = () => readAll<DmarcExternalReport>('x:DmarcExternalReport');
export const fetchTlsReports = () => readAll<TlsExternalReport>('x:TlsExternalReport');
