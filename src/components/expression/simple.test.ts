/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { describeValue, formatCondition, parseCondition, summarize, writeLiteral } from './simple';

const hints = {
  constants: ['relaxed', 'strict', 'disable'],
  variables: ['local_port', 'listener', 'sender_domain', 'remote_ip', 'is_tls'],
};

describe('parseCondition', () => {
  it('reads one comparison of an allowed variable with a literal', () => {
    expect(parseCondition('local_port == 25', hints.variables)).toEqual({
      variable: 'local_port',
      op: '==',
      value: '25',
    });
    expect(parseCondition("listener != 'smtp'", hints.variables)).toEqual({
      variable: 'listener',
      op: '!=',
      value: 'smtp',
    });
    expect(parseCondition('is_tls == true', hints.variables)).toEqual({ variable: 'is_tls', op: '==', value: 'true' });
  });

  it('leaves anything more complex alone', () => {
    expect(parseCondition('is_local_domain(sender_domain)', hints.variables)).toBeNull();
    expect(parseCondition('local_port == 25 && is_tls', hints.variables)).toBeNull();
    expect(parseCondition('local_port == sender_domain', hints.variables)).toBeNull();
    expect(parseCondition('unknown_var == 1', hints.variables)).toBeNull();
  });
});

describe('literals', () => {
  it('quotes words and leaves numbers, durations and booleans bare', () => {
    expect(writeLiteral('smtp')).toBe("'smtp'");
    expect(writeLiteral('25')).toBe('25');
    expect(writeLiteral('5m')).toBe('5m');
    expect(writeLiteral('false')).toBe('false');
    expect(writeLiteral("it's")).toBe("'it\\'s'");
  });

  it('round-trips a condition', () => {
    const c = parseCondition("listener == 'smtp'", hints.variables)!;
    expect(formatCondition(c)).toBe("listener == 'smtp'");
    expect(
      parseCondition(formatCondition({ variable: 'listener', op: '==', value: "it's" }), hints.variables)?.value,
    ).toBe("it's");
  });
});

describe('describeValue', () => {
  it('names constants and unquotes literals, but not expressions', () => {
    expect(describeValue('disable', hints)).toBe('Off');
    expect(describeValue("'mx.example.com'", hints)).toBe('mx.example.com');
    expect(describeValue('sender_domain', hints)).toBeNull();
  });
});

describe('summarize', () => {
  it('says the whole expression in words when it can', () => {
    expect(summarize({ match: {}, else: 'relaxed' }, hints)).toBe('Relaxed');
    expect(summarize({ match: { '0': { if: 'local_port == 25', then: 'relaxed' } }, else: 'disable' }, hints)).toBe(
      'Relaxed when port on this server is 25; otherwise off',
    );
  });

  it('gives up rather than guess', () => {
    expect(
      summarize({ match: { '0': { if: 'is_local_domain(sender_domain)', then: 'relaxed' } }, else: 'disable' }, hints),
    ).toBeNull();
  });
});
