/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { coreState } from './facts';

const different = (...found: string[]) => ({ state: 'different' as const, found });

describe('coreState (#236)', () => {
  it('a DMARC record of the domain’s own, with other report addresses and tags, is valid, not missing', () => {
    expect(
      coreState('dmarc', [
        different('v=DMARC1; p=reject; rua=mailto:dmarc@example.org; ruf=mailto:dmarc@example.org; fo=1'),
      ]),
    ).toBe('valid');
  });

  it('a DMARC record without a policy is different', () => {
    expect(coreState('dmarc', [different('v=DMARC1; rua=mailto:dmarc@example.org')])).toBe('different');
  });

  it('an SPF with an extra include is valid, and other TXT records at the apex don’t count', () => {
    expect(
      coreState('spf', [different('google-site-verification=abc', 'v=spf1 mx include:_spf.example.net -all')]),
    ).toBe('valid');
  });

  it('two SPF records are different, and TXT records that aren’t SPF are missing', () => {
    expect(coreState('spf', [different('v=spf1 mx -all', 'v=spf1 a ~all')])).toBe('different');
    expect(coreState('spf', [different('google-site-verification=abc')])).toBe('missing');
  });

  it('an MX or DKIM that differs stays different; a failed lookup is an error, not missing', () => {
    expect(coreState('mx', [different('10 mx.elsewhere.example')])).toBe('different');
    expect(
      coreState('dkim', [
        { state: 'live', found: [] },
        { state: 'missing', found: [] },
      ]),
    ).toBe('missing');
    expect(coreState('dmarc', [{ state: 'error', found: [] }])).toBe('error');
    expect(coreState('mx', [{ state: 'live', found: [] }])).toBe('live');
  });
});
