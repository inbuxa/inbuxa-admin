/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { storageRows } from './serverFacts';

describe('storageRows', () => {
  it('keeps which kind of account each row is, so a group tile opens the group (#196)', () => {
    const rows = storageRows('Group', [
      { id: 'g1', emailAddress: 'sales@example.org', usedDiskQuota: 2048, quotas: { maxDiskQuota: 4096 } },
    ]);
    expect(rows).toEqual([{ id: 'g1', kind: 'Group', name: 'sales@example.org', used: 2048, quota: 4096 }]);
  });

  it('falls back to the name, and reads no quota as none', () => {
    const [row] = storageRows('User', [{ id: 'u1', name: 'anna' }]);
    expect(row).toEqual({ id: 'u1', kind: 'User', name: 'anna', used: 0, quota: null });
  });
});
