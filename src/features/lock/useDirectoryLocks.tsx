/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: locking from Management › Directory › Accounts, where admins look
 * for it first (audit-hold-lock spec, AL-1). Each person's row menu offers
 * Lock… or Unlock…, and a locked account carries a badge, beside the
 * Compliance › Locked accounts page and the account page's banner.
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Unlock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { DropdownMenuItem, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { useAccountStore } from '@/stores/accountStore';
import { fetchLocks, type AccountLock } from './accountLock';
import { LockDialog, UnlockDialog } from './LockDialogs';

type Dialog = { kind: 'lock'; accountId: string; name?: string } | { kind: 'unlock'; lock: AccountLock } | null;

/** A person's account, as a list row: a group can't be locked. */
function isPerson(item: Record<string, unknown>): boolean {
  return item['@type'] !== 'Group';
}

/** How the row names the person: its address, as the list shows it. */
function labelOf(item: Record<string, unknown>): string | undefined {
  for (const key of ['emailAddress', 'name']) {
    const value = item[key];
    if (typeof value === 'string' && value) return value;
  }
  return undefined;
}

export function useDirectoryLocks(active: boolean) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasPermission('sysAccountLockGet'));
  const canCreate = useAccountStore((s) => s.hasPermission('sysAccountLockCreate'));
  const canDestroy = useAccountStore((s) => s.hasPermission('sysAccountLockDestroy'));
  const enabled = active && canGet;
  const [locks, setLocks] = useState<Map<string, AccountLock>>(new Map());
  const [fetches, setFetches] = useState(0);
  const [dialog, setDialog] = useState<Dialog>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    fetchLocks(undefined, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setLocks(new Map(list.map((l) => [l.id, l])));
      })
      // An older server without locks: offer nothing
      .catch(() => undefined);
    return () => controller.abort();
  }, [enabled, fetches]);

  /** The row menu's lock item, or nothing. */
  const menuItems = (item: Record<string, unknown>): ReactNode => {
    if (!enabled || !isPerson(item)) return null;
    const id = String(item.id);
    const lock = locks.get(id);
    if (lock) {
      if (!canDestroy) return null;
      return (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation();
              setDialog({ kind: 'unlock', lock });
            }}
          >
            <Unlock className="mr-2 h-4 w-4" />
            {t('lock.unlockAction', 'Unlock…')}
          </DropdownMenuItem>
        </>
      );
    }
    if (!canCreate) return null;
    return (
      <>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            setDialog({ kind: 'lock', accountId: id, name: labelOf(item) });
          }}
        >
          <Lock className="mr-2 h-4 w-4" />
          {t('lock.lockThis', 'Lock this account…')}
        </DropdownMenuItem>
      </>
    );
  };

  /** A badge beside a locked account's name. */
  const badge = (item: Record<string, unknown>): ReactNode => {
    if (!enabled || !locks.has(String(item.id))) return null;
    return (
      <Badge variant="destructive" className="ml-2 gap-1 align-middle">
        <Lock className="h-3 w-3" />
        {t('lock.lockedBadge', 'Locked')}
      </Badge>
    );
  };

  const done = () => {
    setDialog(null);
    refetch();
  };

  const dialogs: ReactNode =
    dialog?.kind === 'lock' ? (
      <LockDialog
        accountId={dialog.accountId}
        accountName={dialog.name}
        onClose={() => setDialog(null)}
        onDone={done}
      />
    ) : dialog?.kind === 'unlock' ? (
      <UnlockDialog lock={dialog.lock} onClose={() => setDialog(null)} onDone={done} />
    ) : null;

  return { enabled, menuItems, badge, dialogs };
}
