/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** inbuxa: what POST /api/webhook/test answers, and that answer in words. */

export interface WebhookTestAnswer {
  sent: boolean;
  status?: number;
  ms?: number;
  error?: string;
}

/** The answer as a sentence. */
export function describeTestAnswer(a: WebhookTestAnswer): string {
  if (a.sent) return `Delivered: the receiver answered ${a.status}${a.ms !== undefined ? ` in ${a.ms} ms` : ''}.`;
  if (a.status !== undefined) {
    const hint =
      a.status === 401 || a.status === 403
        ? ' Check the sign-in details or signature key.'
        : a.status === 404
          ? ' Check the URL.'
          : '';
    return `Not accepted: the receiver answered ${a.status}.${hint}`;
  }
  return `Not delivered: ${a.error ?? 'no answer'}`;
}
