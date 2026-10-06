/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { RegistryWriteListener } from '@/services/jmap/client';
import type { RegistryWrite } from '@/lib/settingsApply';
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

// A save on an older server: no x:settingsReload in the response.
function save(...types: string[]) {
  mocks.listener!.started();
  mocks.listener!.finished(types.map((objectName) => ({ objectName })));
}

// A save on a newer server, which applied it or said why not.
function serverSave(objectName: string, applied: boolean, description?: string) {
  const write: RegistryWrite = { objectName, serverReload: description ? { applied, description } : { applied } };
  mocks.listener!.started();
  mocks.listener!.finished([write]);
}

const REFUSED =
  'Saved, but the running settings were not reloaded. Tracer with id b: Only one console tracer is allowed';

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
    mocks.listener!.finished([{ objectName: 'x:Certificate' }]);
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
  describe('a server that applies writes itself', () => {
    it('sends nothing and says "Saved and applied" once per burst', async () => {
      serverSave('x:MtaDeliverySchedule', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS / 2);
      serverSave('x:MtaRoute', true);
      serverSave('x:Certificate', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledTimes(1);
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Saved and applied', variant: 'success' }),
      );
      expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
    });

    it("leaves the toast to the form for types it reloads that the admin doesn't", async () => {
      serverSave('x:Directory', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 2);
      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      expect(mocks.toast).not.toHaveBeenCalled();
    });

    it("shows the server's reason, and Apply now sends ReloadSettings", async () => {
      serverSave('x:Tracer', false, REFUSED);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 2);

      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(useSettingsApplyStore.getState()).toMatchObject({
        pending: ['ReloadSettings'],
        failure: {
          message: 'Tracer with id b: Only one console tracer is allowed',
          object: { object: 'Tracer', id: 'b' },
        },
      });

      mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
      await useSettingsApplyStore.getState().applyNow();
      expect(reloadCreates(mocks.jmapRequest.mock.calls[0][0][0])).toEqual([{ '@type': 'ReloadSettings' }]);
      expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Saved and applied' }));
    });

    it('lets a later write in the burst that applied have the last word', async () => {
      serverSave('x:Tracer', false, REFUSED);
      serverSave('x:Tracer', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });

    it('clears an earlier failure once a later write applies', async () => {
      serverSave('x:Tracer', false, REFUSED);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(useSettingsApplyStore.getState().failure).not.toBeNull();

      serverSave('x:Tracer', true);
      expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });

    it('does not retry a refused reload on an unrelated save', async () => {
      serverSave('x:Tracer', false, REFUSED);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      save('x:Account');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 2);
      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      expect(useSettingsApplyStore.getState().failure).not.toBeNull();
    });

    it('still reloads allowed IPs in full: the report only covers the blocked list', async () => {
      mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
      serverSave('x:AllowedIp', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(reloadCreates(mocks.jmapRequest.mock.calls[0][0][0])).toEqual([{ '@type': 'ReloadSettings' }]);
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });
  });

  describe('a burst mixing both kinds of answer', () => {
    it('sends only what the server left to the admin, and says so once', async () => {
      mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
      serverSave('x:MtaRoute', true);
      serverSave('x:Certificate', true);
      // A type the server doesn't answer for, as an older node would.
      save('x:SomethingNew');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

      expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
      expect(reloadCreates(mocks.jmapRequest.mock.calls[0][0][0])).toEqual([{ '@type': 'ReloadSettings' }]);
      expect(mocks.toast).toHaveBeenCalledTimes(1);
      expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
    });

    it("doesn't take back a reload queued after the server applied one", async () => {
      mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
      save('x:MtaRoute');
      serverSave('x:MtaHook', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      // The server's reload came after the first write and covers it.
      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      expect(mocks.toast).toHaveBeenCalledTimes(1);
      // Nothing is left over to send with a later refusal either.
      serverSave('x:Tracer', false, REFUSED);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(mocks.jmapRequest).not.toHaveBeenCalled();
      serverSave('x:Tracer', true);
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(mocks.toast).toHaveBeenCalledTimes(2);

      serverSave('x:MtaHook', true);
      save('x:MtaRoute');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
      expect(mocks.toast).toHaveBeenCalledTimes(3);
    });

    it("lets the admin's reload settle a server refusal in the same burst", async () => {
      mocks.jmapRequest.mockResolvedValueOnce(answer(['reload-0']));
      serverSave('x:Tracer', false, REFUSED);
      save('x:SomethingNew');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

      expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
      expect(useSettingsApplyStore.getState()).toMatchObject({ pending: [], failure: null });
      expect(mocks.toast).toHaveBeenCalledTimes(1);
    });

    it('shows a refusal once when the admin reload fails too', async () => {
      mocks.jmapRequest.mockResolvedValueOnce(
        answer([], { 'reload-0': { type: 'validationFailed', description: 'Only one console tracer is allowed' } }),
      );
      serverSave('x:Tracer', false, REFUSED);
      save('x:SomethingNew');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS * 2);

      expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
      expect(mocks.toast).not.toHaveBeenCalled();
      expect(useSettingsApplyStore.getState()).toMatchObject({
        pending: ['ReloadSettings'],
        failure: { message: 'Only one console tracer is allowed' },
      });
    });

    it('reports a server answer that lands while a reload is out once it is back', async () => {
      let answerReload: (r: JmapMethodResponse[]) => void = () => {};
      mocks.jmapRequest.mockReturnValueOnce(
        new Promise((resolve) => {
          answerReload = resolve;
        }),
      );
      save('x:MtaRoute');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      expect(useSettingsApplyStore.getState().applying).toBe(true);

      serverSave('x:Certificate', false, 'Saved, but the running settings were not reloaded. Bad key');
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);
      answerReload(answer(['reload-0']));
      await vi.advanceTimersByTimeAsync(APPLY_DELAY_MS);

      expect(mocks.jmapRequest).toHaveBeenCalledTimes(1);
      expect(useSettingsApplyStore.getState()).toMatchObject({
        pending: ['ReloadTlsCertificates'],
        failure: { message: 'Bad key' },
      });
    });
  });
});
