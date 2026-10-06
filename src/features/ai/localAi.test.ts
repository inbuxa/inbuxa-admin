/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const jmapRequest = vi.fn();
vi.mock('@/services/jmap/client', () => ({
  getAccountId: () => 'a',
  jmapRequest: (...args: unknown[]) => jmapRequest(...args),
}));

import {
  DEFAULT_LIMITS,
  DEFAULT_PROMPT,
  enableWithModel,
  fetchLimits,
  fetchStatus,
  LimitsUnavailable,
  locality,
  parseLimits,
  saveLimits,
} from './localAi';
import { fieldPlaceholder, formNotices, variantPrefill } from './formExtras';

beforeEach(() => jmapRequest.mockReset());

describe('locality (AI-2)', () => {
  it.each([
    ['http://127.0.0.1:8080/v1/chat/completions', 'local'],
    ['http://localhost:11434/v1/chat/completions', 'local'],
    ['http://10.0.0.5/v1', 'local'],
    ['http://172.16.1.1/v1', 'local'],
    ['http://172.31.255.1/v1', 'local'],
    ['http://192.168.1.20/v1', 'local'],
    ['http://[::1]:8080/v1', 'local'],
    ['http://[fd12:3456::1]/v1', 'local'],
    ['http://172.32.0.1/v1', 'remote'],
    ['https://8.8.8.8/v1', 'remote'],
    ['https://[2001:db8::1]/v1', 'remote'],
    ['https://api.example.com/v1/chat/completions', 'unknown'],
    ['ai.lan', 'invalid'],
    ['', 'invalid'],
  ])('%s is %s', (url, expected) => {
    expect(locality(url)).toBe(expected);
  });
});

describe('limits', () => {
  it('fills anything unset with the defaults', () => {
    expect(parseLimits({ spamMaxAdded: 1.5 })).toEqual({ ...DEFAULT_LIMITS, spamMaxAdded: 1.5 });
  });

  it('reads the singleton under the fork capability', async () => {
    jmapRequest.mockResolvedValue([['inbuxa:AiLimits/get', { list: [{ maxContentBytes: 4096 }] }, '0']]);
    expect((await fetchLimits()).maxContentBytes).toBe(4096);
    expect(jmapRequest.mock.calls[0][2]).toEqual(['urn:inbuxa:jmap']);
  });

  it('says so when the server has no AI limits', async () => {
    jmapRequest.mockResolvedValue([['error', { type: 'unknownMethod' }, '0']]);
    await expect(fetchLimits()).rejects.toBeInstanceOf(LimitsUnavailable);
  });

  it('sends only what changed, and a return to the default as null', async () => {
    jmapRequest.mockResolvedValue([['inbuxa:AiLimits/set', { updated: { singleton: null } }, '0']]);
    const current = { ...DEFAULT_LIMITS, spamMaxAdded: 3 };
    const next = { ...current, spamMaxAdded: DEFAULT_LIMITS.spamMaxAdded, userCallsPerHour: 10 };
    expect(await saveLimits(current, next)).toEqual({ ok: true });
    const [, args] = jmapRequest.mock.calls[0][0][0];
    expect(args.update.singleton).toEqual({ spamMaxAdded: null, userCallsPerHour: 10 });
  });

  it('sends nothing when nothing changed', async () => {
    expect(await saveLimits(DEFAULT_LIMITS, { ...DEFAULT_LIMITS })).toEqual({ ok: true });
    expect(jmapRequest).not.toHaveBeenCalled();
  });

  it('reports the property the server rejected', async () => {
    jmapRequest.mockResolvedValue([
      [
        'inbuxa:AiLimits/set',
        {
          notUpdated: {
            singleton: { type: 'invalidProperties', properties: ['spamMaxAdded'], description: 'too big' },
          },
        },
        '0',
      ],
    ]);
    const outcome = await saveLimits(DEFAULT_LIMITS, { ...DEFAULT_LIMITS, spamMaxAdded: 99 });
    expect(outcome).toEqual({ ok: false, property: 'spamMaxAdded', message: 'too big' });
  });
});

describe('status', () => {
  it('is off by default, and names the model when on', async () => {
    jmapRequest.mockResolvedValueOnce([
      ['x:SpamLlm/get', { list: [{ '@type': 'Disable' }] }, 'c'],
      ['x:AiModel/get', { list: [] }, 'm'],
    ]);
    expect(await fetchStatus()).toEqual({ enabled: false, modelId: null, models: [] });

    jmapRequest.mockResolvedValueOnce([
      ['x:SpamLlm/get', { list: [{ '@type': 'Enable', modelId: 'm1' }] }, 'c'],
      ['x:AiModel/get', { list: [{ id: 'm1', name: 'local', model: 'q', url: 'http://127.0.0.1/v1' }] }, 'm'],
    ]);
    const on = await fetchStatus();
    expect(on.enabled).toBe(true);
    expect(on.modelId).toBe('m1');
  });
});

describe('guided setup', () => {
  const input = { name: 'local', url: 'http://127.0.0.1:8080/v1/chat/completions', model: 'q', prompt: 'p' };

  it('creates the model, then enables the classifier with its real id', async () => {
    jmapRequest
      .mockResolvedValueOnce([['x:AiModel/set', { created: { m: { id: 'm9' } } }, '0']])
      .mockResolvedValueOnce([['x:SpamLlm/set', { updated: { singleton: null } }, '0']]);
    expect(await enableWithModel(input, [])).toEqual({ ok: true });
    const enable = jmapRequest.mock.calls[1][0][0][1];
    expect(enable.update.singleton).toEqual({ '@type': 'Enable', modelId: 'm9', prompt: 'p' });
  });

  it('reuses a model of the same name instead of creating a duplicate', async () => {
    jmapRequest
      .mockResolvedValueOnce([['x:AiModel/set', { updated: { m1: null } }, '0']])
      .mockResolvedValueOnce([['x:SpamLlm/set', { updated: { singleton: null } }, '0']]);
    await enableWithModel(input, [{ id: 'm1', name: 'local', model: 'old', url: 'http://10.0.0.1/v1' }]);
    const update = jmapRequest.mock.calls[0][0][0][1];
    expect(update.update).toHaveProperty('m1');
    expect(update.create).toBeUndefined();
    expect(jmapRequest.mock.calls[1][0][0][1].update.singleton.modelId).toBe('m1');
  });

  it('never switches the classifier on when the model could not be made', async () => {
    jmapRequest.mockResolvedValueOnce([
      ['x:AiModel/set', { notCreated: { m: { type: 'invalidProperties', properties: ['url'] } } }, '0'],
    ]);
    const outcome = await enableWithModel(input, []);
    expect(outcome.ok).toBe(false);
    expect(outcome.property).toBe('url');
    expect(jmapRequest).toHaveBeenCalledTimes(1);
  });
});

describe('form extras', () => {
  it('prefills the default prompt only when the classifier is switched on', () => {
    expect(variantPrefill('x:SpamLlm', 'Enable')).toEqual({ prompt: DEFAULT_PROMPT });
    expect(variantPrefill('x:SpamLlm', 'Disable')).toEqual({});
    expect(variantPrefill('x:Domain', 'Enable')).toEqual({});
  });

  it('suggests local addresses on the model form only', () => {
    expect(fieldPlaceholder('x:AiModel', 'url')).toMatch(/^http:\/\/127\.0\.0\.1/);
    expect(fieldPlaceholder('x:AiModel', 'name')).toBeUndefined();
    expect(fieldPlaceholder('x:Domain', 'url')).toBeUndefined();
  });

  it('warns about a model outside the network, and never about a local one', () => {
    expect(formNotices('x:AiModel', { url: 'https://8.8.8.8/v1' })[0]?.tone).toBe('warning');
    expect(formNotices('x:AiModel', { url: 'https://api.example.com/v1' })[0]?.tone).toBe('info');
    expect(formNotices('x:AiModel', { url: 'http://127.0.0.1:8080/v1' })).toEqual([]);
    expect(formNotices('x:AiModel', {})).toEqual([]);
  });

  it('tells the classifier form that failures never hold up mail', () => {
    expect(formNotices('x:SpamLlm', {})[0]?.key).toBe('localAi.neverHoldsMail');
  });
});
