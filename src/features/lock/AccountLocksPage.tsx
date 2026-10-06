/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Locked accounts (audit-hold-lock spec,
 * AL-1 to AL-12). Accounts that receive mail but can't sign in, and who
 * they're handed to.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Pencil, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { fetchLocks, LocksUnavailable, type AccountLock } from './accountLock';
import { LockDialog, UnlockDialog } from './LockDialogs';
import { accessLabel } from './labels';

type Load = { kind: 'loading' } | { kind: 'ready'; locks: AccountLock[] } | { kind: 'error'; message: string };

export function AccountLocksPage() {
  const { t } = useTranslation();
  const canCreate = useAccountStore((s) => s.hasPermission('sysAccountLockCreate'));
  const canUpdate = useAccountStore((s) => s.hasPermission('sysAccountLockUpdate'));
  const canDestroy = useAccountStore((s) => s.hasPermission('sysAccountLockDestroy'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [locking, setLocking] = useState(false);
  const [editing, setEditing] = useState<AccountLock | null>(null);
  const [unlocking, setUnlocking] = useState<AccountLock | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchLocks(undefined, controller.signal)
      .then((locks) => {
        // Shared mailboxes have a page of their own (MA-S)
        if (!controller.signal.aborted) setLoad({ kind: 'ready', locks: locks.filter((l) => l.kind === 'lock') });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof LocksUnavailable
              ? t('lock.unavailable', 'This server can’t lock accounts.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  const done = () => {
    setLocking(false);
    setEditing(null);
    setUnlocking(null);
    refetch();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="lock"
        title={t('lock.title', 'Locked accounts')}
        subtitle={t(
          'lock.subtitle',
          'Accounts that keep receiving mail but can’t sign in and send nothing on their own, for someone who left, an investigation or a compromised account. Delegates can open them beside their own mail.',
        )}
        actions={
          canCreate && (
            <Button variant="destructive" onClick={() => setLocking(true)}>
              <Lock className="mr-2 h-4 w-4" />
              {t('lock.lockAction', 'Lock an account…')}
            </Button>
          )
        }
      />

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && load.locks.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('lock.none', 'No account is locked.')}
        </div>
      )}
      {load.kind === 'ready' &&
        load.locks.map((lock) => (
          <div key={lock.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <Lock className="h-4 w-4 text-destructive" />
                  {lock.name}
                </div>
                <div className="text-sm text-muted-foreground">
                  {t('lock.lockedBy', 'Locked {{when}} by {{who}}', {
                    when: new Date(lock.lockedAt).toLocaleString(),
                    who: lock.lockedBy,
                  })}
                </div>
                <div className="mt-1 text-sm">{lock.reason}</div>
              </div>
              <div className="flex gap-2">
                {canUpdate && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(lock)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('lock.editAction', 'Delegates…')}
                  </Button>
                )}
                {canDestroy && (
                  <Button variant="outline" size="sm" onClick={() => setUnlocking(lock)}>
                    <Unlock className="mr-2 h-4 w-4" />
                    {t('lock.unlockAction', 'Unlock…')}
                  </Button>
                )}
              </div>
            </div>
            {lock.delegates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('lock.noDelegates', 'Not handed to anyone.')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lock.delegates.map((d) => (
                  <li key={d.accountId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.name ?? d.accountId}</span>
                    <Badge variant="secondary">{accessLabel(t, d.access)}</Badge>
                    {d.sendAs && <Badge variant="outline">{t('lock.sendsAs', 'sends as')}</Badge>}
                    {d.until && (
                      <span className="text-muted-foreground">
                        {t('lock.untilDay', 'until {{day}}', { day: d.until })}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {locking && <LockDialog onClose={() => setLocking(false)} onDone={done} />}
      {editing && <LockDialog existing={editing} onClose={() => setEditing(null)} onDone={done} />}
      {unlocking && <UnlockDialog lock={unlocking} onClose={() => setUnlocking(null)} onDone={done} />}
    </div>
  );
}
