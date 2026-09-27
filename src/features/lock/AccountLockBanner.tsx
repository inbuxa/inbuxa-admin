/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: on a person's account page, whether it is locked and to whom it is
 * handed, with the way to lock or unlock it (audit-hold-lock spec, AL-1).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountStore } from '@/stores/accountStore';
import { fetchLocks, type AccountLock } from './accountLock';
import { LockDialog, UnlockDialog } from './LockDialogs';
import { accessLabel } from './labels';

export function AccountLockBanner({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasPermission('sysAccountLockGet'));
  const canCreate = useAccountStore((s) => s.hasPermission('sysAccountLockCreate'));
  const canDestroy = useAccountStore((s) => s.hasPermission('sysAccountLockDestroy'));
  const [lock, setLock] = useState<AccountLock | null | undefined>(undefined);
  const [fetches, setFetches] = useState(0);
  const [dialog, setDialog] = useState<'lock' | 'unlock' | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    fetchLocks(accountId, controller.signal)
      .then((locks) => {
        if (!controller.signal.aborted) setLock(locks[0] ?? null);
      })
      // An older server without locks: say nothing
      .catch(() => undefined);
    return () => controller.abort();
  }, [accountId, canGet, fetches]);

  if (!canGet || lock === undefined) return null;
  const done = () => {
    setDialog(null);
    refetch();
  };

  if (!lock) {
    if (!canCreate) return null;
    return (
      <>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setDialog('lock')}>
            <Lock className="mr-2 h-4 w-4" />
            {t('lock.lockThis', 'Lock this account…')}
          </Button>
        </div>
        {dialog === 'lock' && <LockDialog accountId={accountId} onClose={() => setDialog(null)} onDone={done} />}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
        {canDestroy && (
          <Button variant="outline" size="sm" onClick={() => setDialog('unlock')}>
            <Unlock className="mr-2 h-4 w-4" />
            {t('lock.unlockAction', 'Unlock…')}
          </Button>
        )}
      </div>
      {dialog === 'unlock' && <UnlockDialog lock={lock} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}
