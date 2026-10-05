/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: on a person's account page, whether it is locked and to whom it is
 * handed (audit-hold-lock spec, AL-1). Locking and unlocking are beside
 * Delete at the foot of the page (AccountLockButton).
 */

import { useTranslation } from 'react-i18next';
import { Lock, Users } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { useAccountLock } from './useAccountLock';
import { accessLabel } from './labels';

export function AccountLockBanner({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasPermission('sysAccountLockGet'));
  const lock = useAccountLock(accountId, canGet);

  if (!canGet || !lock) return null;
  // MA-S: a shared mailbox is a lock of its own kind, and is nobody's trouble
  if (lock.kind === 'sharedMailbox') {
    return (
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="flex items-start gap-3">
          <Users className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {t('sharedMailbox.bannerTitle', 'Shared mailbox: receives mail; nobody signs in to it.')}
            </p>
            {lock.delegates.length > 0 && (
              <p className="text-muted-foreground">
                {t('sharedMailbox.bannerPeople', 'Opened by')}{' '}
                {lock.delegates.map((d) => `${d.name ?? d.accountId} (${accessLabel(t, d.access)})`).join(', ')}
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <Lock className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">
            {t('lock.bannerTitle', 'Locked: receives mail, can’t sign in, sends nothing on its own.')}
          </p>
          <p className="text-muted-foreground">{lock.reason}</p>
          {lock.delegates.length > 0 && (
            <p className="text-muted-foreground">
              {t('lock.bannerDelegates', 'Handed to')}{' '}
              {lock.delegates.map((d) => `${d.name ?? d.accountId} (${accessLabel(t, d.access)})`).join(', ')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
