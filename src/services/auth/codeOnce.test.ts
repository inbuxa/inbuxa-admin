/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Fresh module per test: the trade under way is kept at module level.
async function load() {
  vi.resetModules();
  return import('./codeOnce');
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('claimCode', () => {
  it('trades a new code', async () => {
    const { claimCode } = await load();
    expect(claimCode('c1')).toBe('trade');
  });

  it('leaves a second run to the trade under way', async () => {
    const { claimCode } = await load();
    claimCode('c1');
    expect(claimCode('c1')).toBe('inFlight');
  });

  it("doesn't trade a code again after it brought tokens, even after a reload", async () => {
    const first = await load();
    first.claimCode('c1');
    first.settleCode('c1', true);
    expect(first.claimCode('c1')).toBe('traded');

    const reloaded = await load();
    expect(reloaded.claimCode('c1')).toBe('traded');
  });

  it('lets a failed trade go without marking the code traded', async () => {
    const { claimCode, settleCode } = await load();
    claimCode('c1');
    settleCode('c1', false);
    expect(claimCode('c1')).toBe('trade');
  });

  it('trades a new code after an old one', async () => {
    const { claimCode, settleCode } = await load();
    claimCode('c1');
    settleCode('c1', true);
    expect(claimCode('c2')).toBe('trade');
  });
});
