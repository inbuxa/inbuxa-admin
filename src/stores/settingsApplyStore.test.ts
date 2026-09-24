/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RegistryWriteListener } from '@/services/jmap/client';
import type { JmapMethodCall, JmapMethodResponse } from '@/types/jmap';

const mocks = vi.hoisted(() => ({
  jmapRequest: vi.fn<(calls: JmapMethodCall[]) => Promise<JmapMethodResponse[]>>(),
  listener: null as RegistryWriteListener | null,
  toast: vi.fn(),
}));

vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'admin',
  jmapRequest: mocks.jmapRequest,
  setRegistryWriteListener: (l: RegistryWriteListener | null) => {
    mocks.listener = l;
  },
}));

vi.mock('@/hooks/use-toast', () => ({ toast: mocks.toast }));

import { APPLY_DELAY_MS, resetSettingsApplyForTests, useSettingsApplyStore } from './settingsApplyStore';

function save(...types: string[]) {
  mocks.listener!.started();
  mocks.listener!.finished(types);
}

function reloadCreates(call: JmapMethodCall): unknown[] {
  expect(call[0]).toBe('x:Action/set');
  return Object.values((call[1] as { create: Record<string, unknown> }).create);
}

function answer(created: string[], notCreated: Record<string, unknown> = {}): JmapMethodResponse[] {
  return [['x:Action/set', { created: Object.fromEntries(created.map((k) => [k, { id: k }])), notCreated }, 'reload']];
}

describe('settingsApplyStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.jmapRequest.mockReset();
    mocks.toast.mockReset();
    resetSettingsApplyForTests();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers with the JMAP client', () => {
    expect(mocks.listener).not.toBeNull();
  });

  it('applies a settings save once writes settle, and says so', async () => {
    mocks.jmapRequest.mockResolvedValue(answer(['reload-0']));
    save('x:MtaDeliverySchedule');
    expect(mocks.jmapRequest).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

    expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
    expect(reloadCreates(mocks.jmapRequest.mock.calls[0][0][0])).toEqual([{ '@type': 'ReloadSettings' }]);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Saved and applied', variant: 'success' }),
    );
    expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], applying: false, failure: null });
  });

  it('sends one reload for a burst of saves', async () => {
    mocks.jmapRequest.mockResolvedValue(answer(['reload-0', 'reload-1']));
    save('x:MtaRoute');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS / 2);
    save('x:MtaRoute');
    // A save still in flight holds the reload back however long it takes.
    mocks.listener!.started();
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 5);
    expect(mocks.jmapRequest).not.toHaveBeenCalled();
    mocks.listener!.finished(['x:Certificate']);
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

    expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
    expect(reloadCreates(mocks.jmapRequest.mock.calls[0][0][0])).toEqual([
      { '@type': 'ReloadTlsCertificates' },
      { '@type': 'ReloadSettings' },
    ]);
  });

  it('does nothing for writes the server applies itself', async () => {
    save('x:Directory', 'x:Account', 'x:Domain');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 2);
    expect(mocks.jmapRequest).not.toHaveBeenCalled();
  });

  it('keeps a failed reload with the object and message, and retries on Apply now', async () => {
    mocks.jmapRequest.mockResolvedValueOnce(
      answer([], {
        'reload-0': {
          type: 'validationFailed',
          description: 'Failed to resolve Pyzor host',
          objectId: { object: 'SpamPyzor', id: 'singleton' },
        },
      }),
    );
    save('x:MtaDeliverySchedule');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

    expect(mocks.toast).not.toHaveBeenCalled();
    expect(useSettingsApplyStore.getState()).toMatchObject({
      pending: ['ReloadSettings'],
      failure: { message: 'Failed to resolve Pyzor host', object: { object: 'SpamPyzor', id: 'singleton' } },
    });

    // An unrelated save doesn't rerun a reload that is known to fail.
    save('x:Account');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 2);
    expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);

    mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
    await useSettingsApplyStore.getState().applyNow();
    expect(mocks.jmapRequest).toHaveBeenCalledTimes(2);
    expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved and applied' }));
  });

  it('tries again by itself when a later save needs a reload', async () => {
    mocks.jmapRequest.mockResolvedValueOnce(answer([], { 'reload-0': { type: 'validationFailed', description: 'x' } }));
    save('x:SpamPyzor');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
    expect(useSettingsApplyStore.getState().failure).not.toBeNull();

    mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
    save('x:SpamPyzor');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
    expect(mocks.jmapRequest).toHaveBeenCalledTimes(2);
    expect(useSettingsApplyStore.getState().failure).toBeNull();
  });

  it('reports a request that fails outright', async () => {
    mocks.jmapRequest.mockRejectedValueOnce(new Error('Network down'));
    save('x:MtaRoute');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
    expect(useSettingsApplyStore.getState()).toMatchObject({
      pending: ['ReloadSettings'],
      failure: { message: 'Network down' },
    });
  });

  it('reports a method error', async () => {
    mocks.jmapRequest.mockResolvedValueOnce([['error', { type: 'forbidden', description: 'Not allowed' }, 'reload']]);
    save('x:MtaRoute');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
    expect(useSettingsApplyStore.getState().failure).toEqual({ message: 'Not allowed' });
  });

  it('dismissing hides the failure but keeps the reload queued', async () => {
    mocks.jmapRequest.mockResolvedValueOnce(answer([], { 'reload-0': { type: 'validationFailed', description: 'x' } }));
    save('x:MtaRoute');
    await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
    useSettingsApplyStore.getState().dismiss();
    expect(useSettingsApplyStore.getState()).toMatchObject({ failure: null, pending: ['ReloadSettings'] });
  });
});
