/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { currentToasts, dismissToast, toast } from './use-toast';

const titles = () => currentToasts().map((t) => t.title);

describe('toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    dismissToast();
    vi.useRealTimers();
  });

  it('shows the newest first, five at most', () => {
    for (let i = 1; i <= 7; i++) toast({ title: `t${i}` });
    expect(titles()).toEqual(['t7', 't6', 't5', 't4', 't3']);
  });

  it('goes after five seconds, or its own duration', () => {
    toast({ title: 'short' });
    toast({ title: 'undo', duration: 10_000 });
    vi.advanceTimersByTime(5000);
    expect(titles()).toEqual(['undo']);
    vi.advanceTimersByTime(5000);
    expect(titles()).toEqual([]);
  });

  it('takes one down by its handle, or all of them', () => {
    const first = toast({ title: 'a' });
    toast({ title: 'b' });
    first.dismiss();
    expect(titles()).toEqual(['b']);
    toast({ title: 'c' });
    dismissToast();
    expect(titles()).toEqual([]);
  });

  it('changes a toast in place, keeping its place and timer', () => {
    toast({ title: 'other' });
    const t = toast({ title: 'Saving', variant: 'info' });
    t.update({ title: 'Saved', variant: 'success' });
    expect(currentToasts()[0]).toMatchObject({ id: t.id, title: 'Saved', variant: 'success' });
    vi.advanceTimersByTime(5000);
    expect(titles()).toEqual([]);
  });

  it("lets a pushed-out toast's timer go quietly", () => {
    const old = toast({ title: 'old' });
    for (let i = 0; i < 5; i++) toast({ title: `n${i}` });
    old.dismiss();
    expect(titles()).toHaveLength(5);
  });
});
