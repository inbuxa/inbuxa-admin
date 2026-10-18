/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// A sign-in code is traded for tokens once. The callback page's effect can
// run again for the same code (StrictMode runs it twice, and it reruns when
// the translations load), and a reload of the page brings the code back; the
// server refuses a spent code, so trading it again showed an error after a
// sign-in that had worked.

const TRADED_KEY = 'inbuxa_admin_traded_code';

let inFlight: string | null = null;

/**
 * What to do with `code`: trade it, leave it to the trade already under way,
 * or nothing, since it was traded already.
 */
export function claimCode(code: string): 'trade' | 'inFlight' | 'traded' {
  if (inFlight === code) return 'inFlight';
  try {
    if (sessionStorage.getItem(TRADED_KEY) === code) return 'traded';
  } catch {
    // Storage off: only the in-flight guard applies.
  }
  inFlight = code;
  return 'trade';
}

/** The trade for `code` is over; `traded` when it brought tokens. */
export function settleCode(code: string, traded: boolean): void {
  if (inFlight === code) inFlight = null;
  if (!traded) return;
  try {
    sessionStorage.setItem(TRADED_KEY, code);
  } catch {
    // Storage off: a reload would try the spent code and say so.
  }
}
