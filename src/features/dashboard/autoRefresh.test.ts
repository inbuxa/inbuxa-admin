/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startAutoRefresh } from './autoRefresh';

describe('startAutoRefresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('refreshes once per chosen interval', () => {
    const refresh = vi.fn();
    const stop = startAutoRefresh(5, refresh, () => false);
    vi.advanceTimersByTime(4 * 60_000 + 59_000);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(15 * 60_000);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('does nothing when off', () => {
    const refresh = vi.fn();
    startAutoRefresh(0, refresh, () => false);
    vi.advanceTimersByTime(60 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
  });

  it('skips beats while the page is hidden', () => {
    const refresh = vi.fn();
    let hidden = true;
    startAutoRefresh(1, refresh, () => hidden);
    vi.advanceTimersByTime(3 * 60_000);
    expect(refresh).not.toHaveBeenCalled();
    hidden = false;
    vi.advanceTimersByTime(60_000);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
