/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { currentLevel, levelValues } from './levels';

// The server's stock values (x:SenderAuth defaults).
const stock = {
  arcVerify: { else: 'disable', match: {} },
  dkimStrict: true,
  dkimVerify: { else: 'relaxed', match: {} },
  dmarcVerify: { else: 'disable', match: { '0': { if: 'local_port == 25', then: 'relaxed' } } },
  reverseIpVerify: { else: 'disable', match: { '0': { if: 'local_port == 25', then: 'relaxed' } } },
  spfEhloVerify: { else: 'disable', match: { '0': { if: 'local_port == 25', then: 'relaxed' } } },
  spfFromVerify: { else: 'disable', match: { '0': { if: 'local_port == 25', then: 'relaxed' } } },
};

describe('levels', () => {
  it('Relaxed is exactly the stock settings', () => {
    expect(currentLevel(stock)).toBe('relaxed');
    expect(levelValues('relaxed')).toEqual(stock);
  });

  it('Recommended honors DMARC reject and checks ARC on port 25', () => {
    const v = levelValues('recommended');
    expect(v.dmarcVerify).toEqual({ match: { '0': { if: 'local_port == 25', then: 'strict' } }, else: 'disable' });
    expect(v.arcVerify).toEqual({ match: { '0': { if: 'local_port == 25', then: 'relaxed' } }, else: 'disable' });
    expect(v.spfFromVerify).toEqual(stock.spfFromVerify);
  });

  it('no level rejects unsigned mail', () => {
    for (const l of ['relaxed', 'recommended', 'strict'] as const) {
      expect(levelValues(l).dkimVerify).toEqual({ match: {}, else: 'relaxed' });
    }
  });

  it('recognises each level it writes, and hand-set values as none', () => {
    for (const l of ['relaxed', 'recommended', 'strict'] as const) expect(currentLevel(levelValues(l))).toBe(l);
    expect(currentLevel({ ...stock, spfEhloVerify: { else: 'strict', match: {} } })).toBeNull();
  });
});
