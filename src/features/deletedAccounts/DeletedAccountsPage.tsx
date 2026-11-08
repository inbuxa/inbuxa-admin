/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Directory › Deleted accounts (undelete spec, UD-15 to
 * UD-17a). Accounts kept after deletion because account retention is set,
 * each restored or destroyed now from here.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RotateCcw, Trash2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { toast } from '@/hooks/use-toast';
import { useAccountStore } from '@/stores/accountStore';
import {
  DeletedAccountsUnavailable,
  destroyDeletedAccount,
  fetchDeletedAccounts,
  restoreDeletedAccount,
  type DeletedAccount,
} from './deletedAccount';

type Load = { kind: 'loading' } | { kind: 'ready'; kept: DeletedAccount[] } | { kind: 'error'; message: string };

const when = (value: string) => (value ? new Date(value).toLocaleString() : '');

export function DeletedAccountsPage() {
  const { t } = useTranslation();
  const canRestore = useAccountStore((s) => s.hasPermission('sysAccountCreate'));
  const canDestroy = useAccountStore((s) => s.hasPermission('sysAccountDestroy'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [restoring, setRestoring] = useState<DeletedAccount | null>(null);
  const [destroying, setDestroying] = useState<DeletedAccount | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchDeletedAccounts(controller.signal)
      .then((kept) => {
        if (!controller.signal.aborted) setLoad({ kind: 'ready', kept });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof DeletedAccountsUnavailable
              ? t('deletedAccounts.unavailable', 'This server doesn’t keep deleted accounts.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  const done = () => {
    setRestoring(null);
    setDestroying(null);
    refetch();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="user-x"
        title={t('deletedAccounts.title', 'Deleted accounts')}
        subtitle={t(
          'deletedAccounts.subtitle',
          'With account retention set, a deleted account is kept for that time before it’s destroyed. Its name and addresses stay taken until then. Restore it, or destroy it now to free them.',
        )}
      />

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && load.kept.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('deletedAccounts.none', 'No deleted account is being kept.')}
        </div>
      )}
      {load.kind === 'ready' &&
        load.kept.map((kept) => (
          <div key={kept.id} className="rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 font-medium">
                  <UserX className="h-4 w-4 text-muted-foreground" />
                  {kept.name}
                </div>
                {kept.addresses.length > 0 && <div className="truncate text-sm">{kept.addresses.join(', ')}</div>}
                <div className="text-sm text-muted-foreground">
                  {t('deletedAccounts.dates', 'Deleted {{deleted}}. Destroyed for good on {{until}}.', {
                    deleted: when(kept.deletedAt),
                    until: when(kept.keptUntil),
                  })}
                </div>
              </div>
              <div className="flex gap-2">
                {canRestore && (
                  <Button variant="outline" size="sm" onClick={() => setRestoring(kept)}>
                    <RotateCcw className="mr-2 h-4 w-4" />
                    {t('deletedAccounts.restoreAction', 'Restore…')}
                  </Button>
                )}
                {canDestroy && (
                  <Button variant="outline" size="sm" onClick={() => setDestroying(kept)}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    {t('deletedAccounts.destroyAction', 'Destroy now…')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}

      {restoring && <RestoreDialog kept={restoring} onClose={() => setRestoring(null)} onDone={done} />}
      {destroying && <DestroyDialog kept={destroying} onClose={() => setDestroying(null)} onDone={done} />}
    </div>
  );
}

function RestoreDialog({ kept, onClose, onDone }: { kept: DeletedAccount; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await restoreDeletedAccount(kept.id, password);
      toast({ title: t('deletedAccounts.restored', '{{name}} is back', { name: kept.name }) });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('deletedAccounts.restoreFailed', 'The account wasn’t restored'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deletedAccounts.restoreTitle', 'Restore {{name}}', { name: kept.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'deletedAccounts.restoreBody',
              'The account comes back as it was, with its mail, addresses and shares. A person signs in with the new password below; their other sign-in methods stay as they were. A group needs no password.',
            )}
          </DialogDescription>
        </DialogHeader>
        <Input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('deletedAccounts.passwordPlaceholder', 'New password')}
          aria-label={t('deletedAccounts.passwordPlaceholder', 'New password')}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('deletedAccounts.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
            {t('deletedAccounts.restoreGo', 'Restore')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DestroyDialog({ kept, onClose, onDone }: { kept: DeletedAccount; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await destroyDeletedAccount(kept.id);
      toast({ title: t('deletedAccounts.destroyed', '{{name}} was destroyed', { name: kept.name }) });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('deletedAccounts.destroyFailed', 'The account wasn’t destroyed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deletedAccounts.destroyTitle', 'Destroy {{name}} now', { name: kept.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'deletedAccounts.destroyBody',
              'Its mail and data are destroyed now instead of when its time runs out, and its name and addresses can be used again. This can’t be undone. An account under a legal hold can’t be destroyed. Type the account’s name to confirm.',
            )}
          </DialogDescription>
        </DialogHeader>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={kept.name}
          aria-label={t('deletedAccounts.confirmName', 'Account name')}
          autoComplete="off"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('deletedAccounts.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void run()} disabled={busy || typed.trim() !== kept.name}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
            {t('deletedAccounts.destroyGo', 'Destroy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
