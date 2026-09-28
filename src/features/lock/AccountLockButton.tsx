/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Lock this account… or Unlock… beside Delete on a person's page,
 * where the account's other lasting actions are (audit-hold-lock spec,
 * AL-1). The banner above the form says whether it is locked; both follow
 * LOCK_CHANGED so they agree after either acts.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useObjectLabel } from '@/lib/objectOptions';
import { LOCK_CHANGED } from './accountLock';
import { useAccountLock } from './useAccountLock';
import { LockDialog, UnlockDialog } from './LockDialogs';

export function AccountLockButton({ accountId, disabled }: { accountId: string; disabled?: boolean }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const canGet = useAccountStore((s) => s.hasPermission('sysAccountLockGet'));
  const canCreate = useAccountStore((s) => s.hasPermission('sysAccountLockCreate'));
  const canDestroy = useAccountStore((s) => s.hasPermission('sysAccountLockDestroy'));
  const lock = useAccountLock(accountId, canGet);
  const { label } = useObjectLabel('x:Account', accountId, schema!);
  const [open, setOpen] = useState(false);

  if (!canGet || lock === undefined) return null;
  const done = () => {
    setOpen(false);
    window.dispatchEvent(new Event(LOCK_CHANGED));
  };

  if (lock) {
    if (!canDestroy) return null;
    return (
      <>
        <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
          <Unlock className="mr-2 h-4 w-4" />
          {t('lock.unlockAction', 'Unlock…')}
        </Button>
        {open && <UnlockDialog lock={lock} onClose={() => setOpen(false)} onDone={done} />}
      </>
    );
  }

  if (!canCreate) return null;
  return (
    <>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => setOpen(true)}>
        <Lock className="mr-2 h-4 w-4" />
        {t('lock.lockThis', 'Lock this account…')}
      </Button>
      {open && (
        <LockDialog
          accountId={accountId}
          accountName={label ?? undefined}
          onClose={() => setOpen(false)}
          onDone={done}
        />
      )}
    </>
  );
}
