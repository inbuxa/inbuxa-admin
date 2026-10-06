/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Directory › Shared mailboxes (multi-account spec,
 * MA-S4). Role addresses such as support@ or legal@ that belong to no one:
 * nobody signs in to them, and the people assigned open them beside their
 * own mail, at the level given here. A shared mailbox is a lock of its own
 * kind on the server, so the people are a lock's delegates.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Pencil, Plus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ObjectPicker } from '@/components/common/ObjectPicker';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { toast } from '@/hooks/use-toast';
import {
  delegateProblem,
  fetchLocks,
  lockAccount,
  LocksUnavailable,
  maxDelegates,
  unlockAccount,
  updateDelegates,
  type AccountLock,
  type Delegate,
} from './accountLock';
import { DelegateEditor } from './LockDialogs';
import { accessLabel } from './labels';

type Load = { kind: 'loading' } | { kind: 'ready'; mailboxes: AccountLock[] } | { kind: 'error'; message: string };

const MAX = maxDelegates('sharedMailbox');

function PeopleDialog({
  existing,
  onClose,
  onDone,
}: {
  existing?: AccountLock;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const [accountId, setAccountId] = useState(existing?.id ?? '');
  const [people, setPeople] = useState<Delegate[]>(existing?.delegates ?? []);
  const [busy, setBusy] = useState(false);
  const problem = accountId ? delegateProblem(people, accountId, 'sharedMailbox') : null;
  const ready = !!accountId && !problem;

  const save = async () => {
    setBusy(true);
    try {
      if (existing) await updateDelegates(existing.id, people, '');
      else await lockAccount(accountId, '', people, 'sharedMailbox');
      toast({
        title: existing
          ? t('sharedMailbox.updated', 'People changed')
          : t('sharedMailbox.created', 'Shared mailbox ready. Nobody can sign in to it now.'),
      });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('sharedMailbox.failed', 'Nothing changed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? t('sharedMailbox.editTitle', 'Who has {{name}}', { name: existing.name })
              : t('sharedMailbox.newTitle', 'Add a shared mailbox')}
          </DialogTitle>
          {!existing && (
            <DialogDescription>
              {t(
                'sharedMailbox.newBody',
                'Choose the account for the address, such as support@. From now on nobody signs in to it: the people below open it beside their own mail, and what they send goes out as it. Its automatic replies keep working. Make the account first under Accounts if it doesn’t exist yet.',
              )}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          {!existing && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t('sharedMailbox.account', 'Account')}</span>
              {schema && (
                <ObjectPicker
                  schema={schema}
                  objectName="x:Account"
                  value={accountId}
                  onChange={setAccountId}
                  placeholder={t('sharedMailbox.chooseAccount', 'Choose the account, such as support@')}
                />
              )}
            </label>
          )}
          <DelegateEditor
            delegates={people}
            onChange={setPeople}
            max={MAX}
            hint={t(
              'sharedMailbox.peopleHint',
              'People who open this mailbox beside their own mail. Each message sent as it is recorded with who sent it.',
            )}
            addLabel={t('sharedMailbox.addPerson', 'Add a person')}
          />
          {problem && <p className="text-sm text-destructive">{problem}</p>}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('lock.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !ready}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {existing ? t('lock.save', 'Save') : t('sharedMailbox.createGo', 'Make it shared')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StopDialog({ mailbox, onClose, onDone }: { mailbox: AccountLock; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await unlockAccount(mailbox.id, '');
      toast({ title: t('sharedMailbox.stopped', 'No longer shared') });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('sharedMailbox.failed', 'Nothing changed'),
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
          <DialogTitle>{t('sharedMailbox.stopTitle', 'Stop sharing {{name}}', { name: mailbox.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'sharedMailbox.stopBody',
              'The people here lose it, and it becomes an ordinary account again: anyone who knows its password can sign in. Its mail stays where it is.',
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('lock.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void run()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('sharedMailbox.stopGo', 'Stop sharing')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SharedMailboxesPage() {
  const { t } = useTranslation();
  const canCreate = useAccountStore((s) => s.hasPermission('sysAccountLockCreate'));
  const canUpdate = useAccountStore((s) => s.hasPermission('sysAccountLockUpdate'));
  const canDestroy = useAccountStore((s) => s.hasPermission('sysAccountLockDestroy'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AccountLock | null>(null);
  const [stopping, setStopping] = useState<AccountLock | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchLocks(undefined, controller.signal)
      .then((locks) => {
        if (!controller.signal.aborted)
          setLoad({ kind: 'ready', mailboxes: locks.filter((l) => l.kind === 'sharedMailbox') });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof LocksUnavailable
              ? t('sharedMailbox.unavailable', 'This server doesn’t offer shared mailboxes.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  const done = () => {
    setAdding(false);
    setEditing(null);
    setStopping(null);
    refetch();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="users"
        title={t('sharedMailbox.title', 'Shared mailboxes')}
        subtitle={t(
          'sharedMailbox.subtitle',
          'Addresses like support@ or legal@ that belong to no one person. Nobody signs in to them; the people you choose open them beside their own mail, and replies go out from the shared address.',
        )}
        actions={
          canCreate && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="mr-2 h-4 w-4" />
              {t('sharedMailbox.addAction', 'Add a shared mailbox…')}
            </Button>
          )
        }
      />

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && load.mailboxes.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('sharedMailbox.none', 'No shared mailboxes yet.')}
        </div>
      )}
      {load.kind === 'ready' &&
        load.mailboxes.map((mailbox) => (
          <div key={mailbox.id} className="space-y-3 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2 font-medium">
                <Users className="h-4 w-4 text-muted-foreground" />
                {mailbox.name}
              </div>
              <div className="flex gap-2">
                {canUpdate && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(mailbox)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('sharedMailbox.editAction', 'People…')}
                  </Button>
                )}
                {canDestroy && (
                  <Button variant="outline" size="sm" onClick={() => setStopping(mailbox)}>
                    <X className="mr-2 h-4 w-4" />
                    {t('sharedMailbox.stopAction', 'Stop sharing…')}
                  </Button>
                )}
              </div>
            </div>
            {mailbox.delegates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('sharedMailbox.noPeople', 'Nobody has it yet.')}</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {mailbox.delegates.map((d) => (
                  <li key={d.accountId} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{d.name ?? d.accountId}</span>
                    <Badge variant="secondary">{accessLabel(t, d.access)}</Badge>
                    {d.sendAs && <Badge variant="outline">{t('lock.sendsAs', 'sends as')}</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {adding && <PeopleDialog onClose={() => setAdding(false)} onDone={done} />}
      {editing && <PeopleDialog existing={editing} onClose={() => setEditing(null)} onDone={done} />}
      {stopping && <StopDialog mailbox={stopping} onClose={() => setStopping(null)} onDone={done} />}
    </div>
  );
}
