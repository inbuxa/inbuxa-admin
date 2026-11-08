/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiFetch = vi.fn();
const jmapRequest = vi.fn();
vi.mock('@/services/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));
vi.mock('@/services/jmap/client', () => ({
  fetchSession: async () => ({ uploadUrl: 'https://mail.example.com/jmap/upload/{accountId}/' }),
  getAccountId: () => 'admin',
  jmapRequest: (...args: unknown[]) => jmapRequest(...args),
}));

const { upgradeRelay, UploadNotDelivered } = await import('./api');

const binary = new File([new Uint8Array(8_375_168)], 'inbuxa-relay-x86_64-linux-musl');

beforeEach(() => {
  apiFetch.mockReset();
  jmapRequest.mockReset();
});

describe('relay upgrade upload', () => {
  it('says the upload never arrived when fetch gets no answer', async () => {
    apiFetch.mockRejectedValue(new TypeError('NetworkError when attempting to fetch resource.'));
    const err = await upgradeRelay('r1', binary, 'sig').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(UploadNotDelivered);
    expect((err as InstanceType<typeof UploadNotDelivered>).size).toBe(8_375_168);
    expect(jmapRequest).not.toHaveBeenCalled();
  });

  it('treats a 413 from a same-site proxy the same way', async () => {
    apiFetch.mockResolvedValue(new Response('too large', { status: 413 }));
    await expect(upgradeRelay('r1', binary, 'sig')).rejects.toBeInstanceOf(UploadNotDelivered);
  });

  it('uploads to the session path and hands the blob to Relay/set', async () => {
    apiFetch.mockResolvedValue(Response.json({ blobId: 'b1' }));
    jmapRequest.mockResolvedValue([['inbuxa:Relay/set', { updated: { r1: null } }, '0']]);
    await upgradeRelay('r1', binary, 'sig');
    expect(apiFetch.mock.calls[0][0]).toBe('/jmap/upload/admin/');
    expect(JSON.stringify(jmapRequest.mock.calls[0])).toContain('"blobId":"b1"');
  });
});
