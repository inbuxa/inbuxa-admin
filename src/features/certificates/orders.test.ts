/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  canOrderAgain,
  domainsFor,
  isValidName,
  nameInDomain,
  orderAgainSet,
  parseNames,
  renewalState,
  suggestDomain,
  utcNow,
} from './orders';

describe('parseNames', () => {
  it('splits on lines, commas and spaces, lowercases and drops repeats and trailing dots', () => {
    expect(parseNames('Mail.Example.com\n*.example.com, mail.example.com.  www.example.com')).toEqual([
      'mail.example.com',
      '*.example.com',
      'www.example.com',
    ]);
  });
});

describe('isValidName', () => {
  it('takes host names and a leading wildcard', () => {
    expect(isValidName('mail.example.com')).toBe(true);
    expect(isValidName('*.example.com')).toBe(true);
  });
  it('refuses single labels, bare wildcards, inner wildcards and bad labels', () => {
    expect(isValidName('localhost')).toBe(false);
    expect(isValidName('*.com')).toBe(false);
    expect(isValidName('a.*.example.com')).toBe(false);
    expect(isValidName('-a.example.com')).toBe(false);
    expect(isValidName('a_b.example.com')).toBe(false);
  });
});

describe('domainsFor', () => {
  const domains = [
    { id: 'a', name: 'example.com' },
    { id: 'b', name: 'lab.example.com' },
    { id: 'c', name: 'other.org' },
  ];
  it('lists the domains covering every name, closest first', () => {
    expect(domainsFor(['x.lab.example.com', '*.lab.example.com'], domains).map((d) => d.id)).toEqual(['b', 'a']);
  });
  it('is empty when the names span domains', () => {
    expect(domainsFor(['x.example.com', 'y.other.org'], domains)).toEqual([]);
  });
  it('counts a wildcard by what follows it', () => {
    expect(nameInDomain('*.example.com', 'example.com')).toBe(true);
    expect(nameInDomain('notexample.com', 'example.com')).toBe(false);
  });
});

describe('suggestDomain', () => {
  it('uses the ending the names share', () => {
    expect(suggestDomain(['mail.example.com', 'www.example.com'])).toBe('example.com');
    expect(suggestDomain(['*.example.com', 'example.com'])).toBe('example.com');
  });
  it('suggests the parent of a single host', () => {
    expect(suggestDomain(['mail.example.com'])).toBe('example.com');
    expect(suggestDomain(['example.com'])).toBe('example.com');
  });
  it('gives up when the names share only a top-level domain', () => {
    expect(suggestDomain(['a.example.com', 'b.other.com'])).toBe('');
  });
});

describe('renewalState', () => {
  it('reads each kind of status', () => {
    expect(renewalState(undefined)).toEqual({ kind: 'none' });
    expect(renewalState({ status: { '@type': 'Pending', due: '2026-12-01T00:00:00Z' } })).toEqual({
      kind: 'pending',
      due: '2026-12-01T00:00:00Z',
    });
    expect(
      renewalState({ status: { '@type': 'Retry', due: '2026-11-07T00:00:00Z', failureReason: 'rate limited' } }),
    ).toEqual({ kind: 'retry', due: '2026-11-07T00:00:00Z', reason: 'rate limited' });
    expect(
      renewalState({ status: { '@type': 'Failed', failedAt: '2026-11-06T00:00:00Z', failureReason: 'NXDOMAIN' } }),
    ).toEqual({ kind: 'failed', at: '2026-11-06T00:00:00Z', reason: 'NXDOMAIN' });
  });
  it('offers Order again only when it would order something', () => {
    expect(canOrderAgain({ kind: 'pending', due: null })).toBe(false);
    expect(canOrderAgain({ kind: 'failed', at: null, reason: '' })).toBe(true);
    expect(canOrderAgain({ kind: 'none' })).toBe(true);
  });
});

describe('orderAgainSet', () => {
  const now = new Date('2026-11-06T23:59:01.234Z');
  it('runs the queued task now instead of adding another', () => {
    expect(utcNow(now)).toBe('2026-11-06T23:59:01Z');
    expect(orderAgainSet('d1', 't1', now)).toEqual({
      update: {
        t1: { status: { '@type': 'Pending', due: '2026-11-06T23:59:01Z' } },
      },
    });
  });
  it('creates one when nothing is queued', () => {
    expect(orderAgainSet('d1', undefined, now)).toEqual({
      create: {
        renew: {
          '@type': 'AcmeRenewal',
          domainId: 'd1',
          status: { '@type': 'Pending', due: '2026-11-06T23:59:01Z' },
        },
      },
    });
  });
});
