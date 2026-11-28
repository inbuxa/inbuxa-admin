/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JmapMethodCall, JmapMethodResponse } from '@/types/jmap';

const mocks = vi.hoisted(() => ({
  jmapRequest: vi.fn<(calls: JmapMethodCall[]) => Promise<JmapMethodResponse[]>>(),
}));

vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'admin',
  jmapRequest: mocks.jmapRequest,
}));

import { PolicyUnavailable } from '@/features/hardening/protocolPolicy';
import {
  COUNT_NO,
  COUNT_YES,
  CountSettingsRefused,
  DEFAULT_ENDPOINT,
  fetchCountSettings,
  parseCountSettings,
  updateCountSettings,
} from './countSettings';

beforeEach(() => mocks.jmapRequest.mockReset());

describe('count settings', () => {
  it('reads a fresh server as off, unanswered, and pointed at the default collector', () => {
    expect(parseCountSettings({})).toEqual({
      enabled: false,
      decided: false,
      endpoint: DEFAULT_ENDPOINT,
      installId: null,
      lastCheckIn: null,
      preview: '',
    });
  });

  it('reads every property the server sends', () => {
    const preview = '{"id":"3f2a","version":"27.1-rc.50"}';
    expect(
      parseCountSettings({
        enabled: true,
        decided: true,
        endpoint: 'https://count.example.org/v1',
        installId: '3f2a',
        lastCheckIn: '2026-11-23',
        preview,
      }),
    ).toEqual({
      enabled: true,
      decided: true,
      endpoint: 'https://count.example.org/v1',
      installId: '3f2a',
      lastCheckIn: '2026-11-23',
      preview,
    });
  });

  it('gets the singleton with the inbuxa capability', async () => {
    mocks.jmapRequest.mockResolvedValue([
      ['inbuxa:CountSettings/get', { list: [{ id: 'singleton', enabled: false, decided: true, preview: '{}' }] }, '0'],
    ]);
    const settings = await fetchCountSettings();
    expect(settings.decided).toBe(true);
    const [calls, , using] = mocks.jmapRequest.mock.calls[0] as unknown as [JmapMethodCall[], unknown, string[]];
    expect(calls[0][0]).toBe('inbuxa:CountSettings/get');
    expect(using).toEqual(['urn:inbuxa:jmap']);
  });

  it('says a server without the setting has none', async () => {
    mocks.jmapRequest.mockResolvedValue([['error', { type: 'unknownMethod' }, '0']]);
    await expect(fetchCountSettings()).rejects.toBeInstanceOf(PolicyUnavailable);
  });

  it('sets only what it is given, on the singleton', async () => {
    mocks.jmapRequest.mockResolvedValue([['inbuxa:CountSettings/set', { updated: { singleton: null } }, '0']]);
    await updateCountSettings(COUNT_YES);
    await updateCountSettings(COUNT_NO);
    const update = (n: number) =>
      ((mocks.jmapRequest.mock.calls[n][0] as JmapMethodCall[])[0][1] as { update: Record<string, unknown> }).update;
    expect(update(0)).toEqual({ singleton: { enabled: true, decided: true } });
    expect(update(1)).toEqual({ singleton: { enabled: false, decided: true } });
  });

  it("passes on the server's reason for refusing an address", async () => {
    mocks.jmapRequest.mockResolvedValue([
      [
        'inbuxa:CountSettings/set',
        {
          notUpdated: {
            singleton: {
              type: 'invalidProperties',
              description: 'The endpoint must be https',
              properties: ['endpoint'],
            },
          },
        },
        '0',
      ],
    ]);
    const refused = await updateCountSettings({ endpoint: 'http://x' }).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(CountSettingsRefused);
    expect((refused as CountSettingsRefused).message).toBe('The endpoint must be https');
    expect((refused as CountSettingsRefused).properties).toEqual(['endpoint']);
  });
});
