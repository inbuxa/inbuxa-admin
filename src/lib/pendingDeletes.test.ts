/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  flushPendingDeletes,
  heldCount,
  isPendingDelete,
  scheduleDelete,
  usePendingDeletes,
  type Commit,
} from './pendingDeletes';

const ok: Commit = async (_object, ids) => ({ destroyed: ids, errors: {} });

describe('scheduleDelete', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePendingDeletes.setState({ pending: {}, versions: {} });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('hides the objects at once and sends nothing until the time is up', async () => {
    const commit = vi.fn(ok);
    const s = scheduleDelete('x:Domain', ['a', 'b'], commit, 1000);
    expect(isPendingDelete('x:Domain', 'a')).toBe(true);
    expect(isPendingDelete('x:Account', 'a')).toBe(false);
    await vi.advanceTimersByTimeAsync(999);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledWith('x:Domain', ['a', 'b']);
    expect(await s.settled).toEqual({ destroyed: ['a', 'b'], errors: {} });
    expect(isPendingDelete('x:Domain', 'a')).toBe(false);
    expect(heldCount()).toBe(0);
  });

  it('undo in time forgets the delete and shows the objects again', async () => {
    const commit = vi.fn(ok);
    const s = scheduleDelete('x:Domain', ['a'], commit, 1000);
    expect(s.undo()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(commit).not.toHaveBeenCalled();
    expect(await s.settled).toBeNull();
    expect(isPendingDelete('x:Domain', 'a')).toBe(false);
  });

  it('undo after the delete was sent does nothing', async () => {
    const s = scheduleDelete('x:Domain', ['a'], ok, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await s.settled;
    expect(s.undo()).toBe(false);
  });

  it('bumps the version for its kind of object, so lists reload', async () => {
    scheduleDelete('x:Domain', ['a'], ok, 1000);
    expect(usePendingDeletes.getState().versions['x:Domain']).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(usePendingDeletes.getState().versions['x:Domain']).toBe(2);
    expect(usePendingDeletes.getState().versions['x:Account']).toBeUndefined();
  });

  it('reports a refused or failed delete, and shows the objects again', async () => {
    const refused = scheduleDelete(
      'x:Domain',
      ['a'],
      async () => ({ destroyed: [], errors: { a: { type: 'objectIsLinked' } } }),
      1000,
    );
    const thrown = scheduleDelete(
      'x:Account',
      ['b'],
      async () => {
        throw new Error('offline');
      },
      1000,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect((await refused.settled)?.errors.a.type).toBe('objectIsLinked');
    expect((await thrown.settled)?.errors.b).toEqual({ type: 'serverFail', description: 'offline' });
    expect(isPendingDelete('x:Domain', 'a')).toBe(false);
    expect(isPendingDelete('x:Account', 'b')).toBe(false);
  });

  it('flush sends every waiting delete now', async () => {
    const commit = vi.fn(ok);
    scheduleDelete('x:Domain', ['a'], commit, 60_000);
    scheduleDelete('x:Account', ['b'], commit, 60_000);
    expect(heldCount()).toBe(2);
    await flushPendingDeletes();
    expect(commit).toHaveBeenCalledTimes(2);
    expect(heldCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(commit).toHaveBeenCalledTimes(2);
  });
});
