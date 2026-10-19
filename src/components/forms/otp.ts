/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** Two-factor setup: a new authenticator secret, checking the first code, and reading the stored state. */
import * as OTPAuth from 'otpauth';
import { SECRET_MASK } from '@/lib/jmapUtils';

export interface OtpAuthValue {
  otpUrl?: string | null;
  otpCode?: string | null;
}

/**
 * A new 20-byte secret, with the otpauth:// link an authenticator app reads.
 * The link carries no `image`: that would have the app fetch a logo from a
 * third-party site at every setup.
 */
export function newTotp(): { totp: OTPAuth.TOTP; url: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'inbuxa',
    label: 'account',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });
  return { totp, url: totp.toString() };
}

/** The secret in groups of four, easier to type into an app by hand. */
export function groupedSecret(base32: string): string {
  return base32.replace(/(.{4})/g, '$1 ').trim();
}

/** Whether the code typed at setup matches the new secret, allowing one period of clock drift. */
export function checkSetupCode(totp: OTPAuth.TOTP, code: string): 'missing' | 'wrong' | 'ok' {
  const token = code.trim();
  if (!token) return 'missing';
  return totp.validate({ token, window: 1 }) === null ? 'wrong' : 'ok';
}

/** Codes are digits; spaces people paste or type between groups are dropped. */
export const withoutSpaces = (code: string) => code.replace(/\s+/g, '');

/** Whether two-factor is on, and the current code typed so far (never the server's mask). */
export function readOtp(value: unknown): { configured: boolean; code: string } {
  const v = (value as OtpAuthValue | null | undefined) ?? {};
  return {
    configured: v.otpUrl != null && v.otpUrl !== '',
    code: typeof v.otpCode === 'string' && v.otpCode !== SECRET_MASK ? v.otpCode : '',
  };
}
