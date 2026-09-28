/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Sender checks as three levels (settings-reorg, first wave). What
 * each setting really does, from the SMTP code:
 *
 * - relaxed: check, record the result for the spam filter, reject nothing;
 * - strict SPF or reverse DNS: reject anything that isn't a pass, including
 *   a sender with no SPF record or no reverse DNS at all;
 * - strict DKIM: reject every message without a passing signature, unsigned
 *   mail included, which RFC 6376 §6.1 advises against, so no level uses it;
 * - strict DMARC: reject only when the sender's domain publishes p=reject
 *   and the message fails, which is what that domain asked for;
 * - strict ARC: reject a broken ARC chain (no chain passes).
 *
 * Checks apply on port 25, where other servers deliver; mail from signed-in
 * users (587/465) isn't checked, as in the stock settings. DKIM keeps its
 * stock "relaxed everywhere".
 */

export type Level = 'relaxed' | 'recommended' | 'strict';
export const LEVELS: Level[] = ['relaxed', 'recommended', 'strict'];

export type Expr = { match: Record<string, { if: string; then: string }>; else: string };

export const CHECKS = [
  'spfEhloVerify',
  'spfFromVerify',
  'dkimVerify',
  'dmarcVerify',
  'arcVerify',
  'reverseIpVerify',
] as const;
export type Check = (typeof CHECKS)[number];

type Mode = 'relaxed' | 'strict' | 'disable';

const onPort25 = (mode: Mode): Expr => ({ match: { '0': { if: 'local_port == 25', then: mode } }, else: 'disable' });
const everywhere = (mode: Mode): Expr => ({ match: {}, else: mode });

const MODES: Record<Level, Record<Check, Mode>> = {
  relaxed: {
    spfEhloVerify: 'relaxed',
    spfFromVerify: 'relaxed',
    dkimVerify: 'relaxed',
    dmarcVerify: 'relaxed',
    arcVerify: 'disable',
    reverseIpVerify: 'relaxed',
  },
  recommended: {
    spfEhloVerify: 'relaxed',
    spfFromVerify: 'relaxed',
    dkimVerify: 'relaxed',
    dmarcVerify: 'strict',
    arcVerify: 'relaxed',
    reverseIpVerify: 'relaxed',
  },
  strict: {
    spfEhloVerify: 'relaxed',
    spfFromVerify: 'strict',
    dkimVerify: 'relaxed',
    dmarcVerify: 'strict',
    arcVerify: 'strict',
    reverseIpVerify: 'strict',
  },
};

export function modeOf(level: Level, check: Check): Mode {
  return MODES[level][check];
}

/** The six expressions a level writes, plus rejecting insecure DKIM signatures. */
export function levelValues(level: Level): Record<Check, Expr> & { dkimStrict: boolean } {
  const out = { dkimStrict: true } as Record<Check, Expr> & { dkimStrict: boolean };
  for (const c of CHECKS) {
    const mode = MODES[level][c];
    out[c] = c === 'dkimVerify' ? everywhere(mode) : mode === 'disable' ? everywhere('disable') : onPort25(mode);
  }
  return out;
}

function norm(e: unknown): string {
  const x = (e ?? {}) as Partial<Expr>;
  const rules = Object.values(x.match ?? {}).map((r) => [r.if.replace(/\s+/g, ' ').trim(), r.then.trim()]);
  return JSON.stringify([rules, (x.else ?? '').trim()]);
}

/** Which level the current settings are, or null when they've been set by hand. */
export function currentLevel(values: Record<string, unknown>): Level | null {
  return (
    LEVELS.find((level) => {
      const want = levelValues(level);
      return CHECKS.every((c) => norm(values[c]) === norm(want[c])) && values.dkimStrict !== false;
    }) ?? null
  );
}
