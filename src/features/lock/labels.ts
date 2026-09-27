/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** INBUXA: the words for a delegate's access level (AL-6). */

import type { Access } from './accountLock';

type T = (key: string, fallback: string) => string;

export function accessLabel(t: T, access: Access): string {
  switch (access) {
    case 'read':
      return t('lock.access.read', 'Read only');
    case 'organize':
      return t('lock.access.organize', 'Read and organize');
    case 'full':
      return t('lock.access.full', 'Full');
  }
}
