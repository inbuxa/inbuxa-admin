/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, it, expect, vi } from 'vitest';
import * as OTPAuth from 'otpauth';
import { checkSetupCode, groupedSecret, newTotp, readOtp, withoutSpaces } from './otp';

afterEach(() => vi.useRealTimers());

describe('newTotp', () => {
  it('makes a six-digit, 30-second SHA-1 secret of 20 bytes', () => {
    const { totp, url } = newTotp();
    expect(totp.secret.bytes).toHaveLength(20);
    expect(totp.secret.base32).toMatch(/^[A-Z2-7]{32}$/);
    const parsed = OTPAuth.URI.parse(url) as OTPAuth.TOTP;
    expect(parsed).toBeInstanceOf(OTPAuth.TOTP);
    expect(parsed).toMatchObject({ issuer: 'inbuxa', label: 'account', algorithm: 'SHA1', digits: 6, period: 30 });
    expect(parsed.secret.base32).toBe(totp.secret.base32);
  });

  it('gives a link with no image to fetch', () => {
    expect(newTotp().url).toMatch(/^otpauth:\/\/totp\/inbuxa:account\?/);
    expect(newTotp().url).not.toContain('image');
  });

  it('makes a different secret each time', () => {
    expect(newTotp().totp.secret.base32).not.toBe(newTotp().totp.secret.base32);
  });
});

describe('groupedSecret', () => {
  it('splits the secret into groups of four', () => {
    expect(groupedSecret('AMFBCGA7EYWTIO2CJFIFOXTFNRZXVAMI')).toBe('AMFB CGA7 EYWT IO2C JFIF OXTF NRZX VAMI');
    expect(groupedSecret('ABCDEF')).toBe('ABCD EF');
    expect(groupedSecret('')).toBe('');
  });
});

describe('checkSetupCode', () => {
  const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32('AMFBCGA7EYWTIO2CJFIFOXTFNRZXVAMI') });

  it('asks for a code when none was typed', () => {
    expect(checkSetupCode(totp, '')).toBe('missing');
    expect(checkSetupCode(totp, '   ')).toBe('missing');
  });

  it('takes the current code, and the ones a period either side', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-18T19:00:07Z'));
    expect(checkSetupCode(totp, '344939')).toBe('ok');
    expect(checkSetupCode(totp, ' 344939 ')).toBe('ok');
    const at = (s: number) => totp.generate({ timestamp: Date.now() + s * 1000 });
    expect(checkSetupCode(totp, at(-30))).toBe('ok');
    expect(checkSetupCode(totp, at(30))).toBe('ok');
    expect(checkSetupCode(totp, at(90))).toBe('wrong');
    expect(checkSetupCode(totp, '000000')).toBe('wrong');
  });
});

describe('withoutSpaces', () => {
  it('drops every space', () => {
    expect(withoutSpaces(' 344 939\t')).toBe('344939');
  });
});

describe('readOtp', () => {
  it('is off without a link', () => {
    expect(readOtp(undefined)).toEqual({ configured: false, code: '' });
    expect(readOtp(null)).toEqual({ configured: false, code: '' });
    expect(readOtp({ otpUrl: null })).toEqual({ configured: false, code: '' });
    expect(readOtp({ otpUrl: '' })).toEqual({ configured: false, code: '' });
  });

  it('is on with a link, showing the code typed but never the mask', () => {
    expect(readOtp({ otpUrl: 'otpauth://totp/x', otpCode: '****' })).toEqual({ configured: true, code: '' });
    expect(readOtp({ otpUrl: 'otpauth://totp/x', otpCode: '12' })).toEqual({ configured: true, code: '12' });
    expect(readOtp({ otpUrl: '****', otpCode: null })).toEqual({ configured: true, code: '' });
  });
});
