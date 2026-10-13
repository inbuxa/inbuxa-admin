/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the server's directory test, `POST /api/directory/test`, shared by
 * the guided setup and a saved directory's own page (admin #109). It tries a
 * saved directory below the sign-in path: nothing is created, and a wrong
 * password doesn't count against anyone.
 */

import { apiFetch } from '@/services/api';

export interface DirectoryTestResult {
  kind?: string;
  opened: boolean;
  error?: string;
  oidc?: { issuer: string };
  lookup?: {
    found?: 'account' | 'group' | 'none';
    email?: string;
    aliases?: string[];
    groups?: string[];
    description?: string | null;
    error?: string;
  };
  signIn?: { ok: boolean; wrongPassword?: boolean; error?: string; email?: string };
}

/** An address no directory holds: looking it up shows the directory can be searched. */
export const CHECK_ADDRESS = 'check@invalid';

/**
 * Test directory `id`, looking `address` up and, with a password, signing in.
 * Null when the server still hasn't loaded the directory after a few tries.
 */
export async function testDirectory(
  id: string,
  address: string,
  password?: string,
): Promise<DirectoryTestResult | null> {
  // The server rebuilds directories a moment after a save.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await apiFetch('/api/directory/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryId: id, address: address.trim() || CHECK_ADDRESS, password: password || undefined }),
    });
    if (!res.ok) {
      const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
      throw new Error(problem.detail ?? problem.title ?? `The test failed (${res.status}).`);
    }
    const body = (await res.json()) as DirectoryTestResult;
    if (body.opened || !body.error?.startsWith("The server hasn't loaded")) return body;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}
