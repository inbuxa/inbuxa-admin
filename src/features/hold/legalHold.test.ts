/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import {
  dayFromServer,
  draftProblem,
  EMPTY_SCOPE,
  formatSize,
  fromToServer,
  narrowingProblem,
  toToServer,
  type HoldDraft,
  type LegalHold,
} from './legalHold';

const draft = (patch: Partial<HoldDraft> = {}): HoldDraft => ({
  name: 'Matter 4411',
  reference: '',
  description: '',
  scope: { ...EMPTY_SCOPE, accounts: ['b'] },
  from: '',
  to: '',
  ...patch,
});

const hold = (patch: Partial<LegalHold> = {}): LegalHold => ({
  id: 'a',
  name: 'Matter 4411',
  reference: '',
  description: '',
  scope: { ...EMPTY_SCOPE, accounts: ['b'], domains: ['d'] },
  from: '2026-01-01',
  to: '2026-06-30',
  placedAt: '2026-09-27T00:00:00Z',
  placedBy: 'admin',
  released: false,
  releasedAt: null,
  releasedBy: null,
  releaseReason: null,
  ...patch,
});

describe('legal hold drafts', () => {
  it('needs a name, a scope and a forward range', () => {
    expect(draftProblem(draft())).toBeNull();
    expect(draftProblem(draft({ name: ' ' }))).toMatch(/name/);
    expect(draftProblem(draft({ scope: { ...EMPTY_SCOPE } }))).toMatch(/covers/);
    expect(draftProblem(draft({ scope: { ...EMPTY_SCOPE, server: true } }))).toBeNull();
    expect(draftProblem(draft({ from: '2026-02-01', to: '2026-01-01' }))).toMatch(/after/);
  });

  it('only widens (LH-3)', () => {
    const current = hold();
    const same = { ...draft(), scope: { ...current.scope }, from: current.from, to: current.to };
    expect(narrowingProblem(current, same)).toBeNull();
    expect(narrowingProblem(current, { ...same, from: '2025-01-01', to: '' })).toBeNull();
    expect(narrowingProblem(current, { ...same, from: '2026-03-01' })).toMatch(/widened/);
    expect(narrowingProblem(current, { ...same, to: '2026-05-01' })).toMatch(/widened/);
    expect(narrowingProblem(current, { ...same, scope: { ...current.scope, domains: [] } })).toMatch(/taken out/);
    expect(narrowingProblem(hold({ from: '', to: '' }), { ...same, from: '2026-01-01' })).toMatch(/widened/);
  });

  it('sends whole UTC days', () => {
    expect(fromToServer('2026-01-01')).toBe('2026-01-01T00:00:00Z');
    expect(toToServer('2026-06-30')).toBe('2026-06-30T23:59:59Z');
    expect(fromToServer('')).toBeNull();
    expect(dayFromServer('2026-06-30T23:59:59Z')).toBe('2026-06-30');
    expect(dayFromServer(null)).toBe('');
  });

  it('shows sizes as people read them', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(512)).toBe('512 B');
    expect(formatSize(1536)).toBe('1.5 KB');
    expect(formatSize(20 * 1024 * 1024)).toBe('20 MB');
  });
});
