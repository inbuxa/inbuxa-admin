/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: a person's passkeys on their account page (passkeys spec, the
 * inbuxa Admin interface). An administrator sees another account's passkeys
 * and can rename or remove them, which is how someone who lost theirs gets
 * back in. Only the account's owner can add one: the browser part runs on
 * the server's own registration page, opened in a new window.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { KeyRound, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from '@/hooks/use-toast';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import {
  createPasskey,
  fetchPasskeys,
  MAX_NAME,
  nameProblem,
  PasskeyRefused,
  removePasskeys,
  renamePasskey,
  type Passkey,
} from './passkeys';

function when(value: string, locale: string): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });
}

function nameMessage(t: TFunction, name: string): string | null {
  const problem = nameProblem(name);
  if (problem === 'empty') return t('passkeys.nameEmpty', 'Give the passkey a name.');
  if (problem === 'tooLong') return t('passkeys.nameTooLong', 'At most {{max}} characters.', { max: MAX_NAME });
  return null;
}

/** What a removal does, said before it happens. */
function removalWarning(t: TFunction, own: boolean): string {
  return own
    ? t(
        'passkeys.removeOwnWarning',
        'Removing a passkey signs you out everywhere, this console included. Your password still works.',
      )
    : t('passkeys.removeWarning', 'Removing a passkey signs this account out everywhere. Its password still works.');
}

export function PasskeysPanel({ accountId }: { accountId: string }) {
  const { t, i18n } = useTranslation();
  const own = useAuthStore((s) => s.primaryAccountId === accountId);
  const has = useAccountStore((s) => s.hasPermission);
  const canGet = has('sysPasskeyGet') && (own || has('sysAccountUpdate'));
  const canRename = has('sysPasskeyUpdate');
  const canRemove = has('sysPasskeyDestroy');
  const canAdd = own && has('sysPasskeyCreate');

  // undefined until known; null when the server has no passkeys for us to show
  const [passkeys, setPasskeys] = useState<Passkey[] | null | undefined>(undefined);
  const [fetches, setFetches] = useState(0);
  const refresh = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    fetchPasskeys(accountId, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setPasskeys(list);
      })
      // An older server, or an account out of reach: show nothing
      .catch(() => {
        if (!controller.signal.aborted) setPasskeys(null);
      });
    return () => controller.abort();
  }, [accountId, canGet, fetches]);

  if (!canGet || passkeys === null) return null;

  return (
    <Card className="mx-auto max-w-4xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="h-4 w-4" />
          {t('passkeys.title', 'Passkeys')}
        </CardTitle>
        <CardDescription>
          {t(
            'passkeys.description',
            'Passkeys sign in on the server’s sign-in page in place of the password. Mail apps that use IMAP or SMTP still use the password or an app password.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {passkeys === undefined ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : passkeys.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {own ? t('passkeys.noneOwn', 'You have no passkeys yet.') : t('passkeys.none', 'No passkeys.')}
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {passkeys.map((p) => (
              <PasskeyRow
                key={p.id}
                passkey={p}
                accountId={accountId}
                own={own}
                canRename={canRename}
                canRemove={canRemove}
                locale={i18n.language}
                onChanged={refresh}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-start justify-between gap-3">
          {canAdd ? <AddPasskey accountId={accountId} onChanged={refresh} /> : <span />}
          {canRemove && passkeys && passkeys.length > 1 && (
            <RemoveAll accountId={accountId} ids={passkeys.map((p) => p.id)} own={own} onChanged={refresh} />
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function PasskeyRow({
  passkey,
  accountId,
  own,
  canRename,
  canRemove,
  locale,
  onChanged,
}: {
  passkey: Passkey;
  accountId: string;
  own: boolean;
  canRename: boolean;
  canRemove: boolean;
  locale: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.name);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const problem = nameMessage(t, name);

  const rename = async () => {
    setBusy(true);
    try {
      await renamePasskey(accountId, passkey.id, name);
      setEditing(false);
      onChanged();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('passkeys.renameFailed', 'The passkey wasn’t renamed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await removePasskeys(accountId, [passkey.id]);
      toast({ title: t('passkeys.removed', 'Passkey removed') });
      onChanged();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('passkeys.removeFailed', 'The passkey wasn’t removed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  const pending = passkey.state === 'pending';
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-3">
      <div className="min-w-0 space-y-1">
        {editing ? (
          <div className="flex items-center gap-2">
            <Input
              value={name}
              maxLength={MAX_NAME * 2}
              onChange={(e) => setName(e.target.value)}
              aria-label={t('passkeys.name', 'Name')}
              className="h-8 w-56"
              autoFocus
            />
            <Button size="sm" onClick={rename} disabled={busy || !!problem}>
              {t('common.save', 'Save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setEditing(false);
                setName(passkey.name);
              }}
              disabled={busy}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        ) : (
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            <span className="truncate">{passkey.name}</span>
            {pending && <Badge variant="outline">{t('passkeys.pending', 'Not finished')}</Badge>}
            {!pending && !passkey.usable && (
              <Badge variant="destructive">{t('passkeys.needsReAdding', 'Needs re-adding')}</Badge>
            )}
            {passkey.backedUp && <Badge variant="secondary">{t('passkeys.synced', 'Synced')}</Badge>}
          </p>
        )}
        {editing && problem && <p className="text-xs text-destructive">{problem}</p>}
        <p className="text-xs text-muted-foreground">
          {pending
            ? t('passkeys.pendingHint', 'Registration wasn’t finished. Remove it and add the passkey again.')
            : [
                t('passkeys.added', 'Added {{when}}', { when: when(passkey.createdAt, locale) }),
                passkey.lastUsedAt
                  ? t('passkeys.lastUsed', 'last used {{when}}', { when: when(passkey.lastUsedAt, locale) })
                  : t('passkeys.neverUsed', 'never used'),
              ].join(' · ')}
        </p>
        {!pending && !passkey.usable && (
          <p className="text-xs text-muted-foreground">
            {t(
              'passkeys.needsReAddingHint',
              'It was added for the server’s earlier name and can’t sign in here any more. Remove it and add a new one.',
            )}
          </p>
        )}
      </div>
      {!editing && (
        <div className="flex items-center gap-2">
          {canRename && !pending && (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)} disabled={busy}>
              <Pencil className="mr-1 h-3.5 w-3.5" />
              {t('passkeys.rename', 'Rename')}
            </Button>
          )}
          {canRemove && (
            <Button size="sm" variant="outline" onClick={() => setConfirming(true)} disabled={busy}>
              <Trash2 className="mr-1 h-3.5 w-3.5" />
              {t('passkeys.remove', 'Remove')}
            </Button>
          )}
        </div>
      )}
      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('passkeys.removeTitle', 'Remove “{{name}}”?', { name: passkey.name })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? t('passkeys.removePendingWarning', 'It was never finished, so nothing else changes.')
                : removalWarning(t, own)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void remove();
              }}
            >
              {t('passkeys.remove', 'Remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

function RemoveAll({
  accountId,
  ids,
  own,
  onChanged,
}: {
  accountId: string;
  ids: string[];
  own: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const removeAll = async () => {
    setBusy(true);
    try {
      await removePasskeys(accountId, ids);
      toast({ title: t('passkeys.allRemoved', 'All passkeys removed') });
      onChanged();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('passkeys.removeFailed', 'The passkey wasn’t removed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
        <Trash2 className="mr-1 h-3.5 w-3.5" />
        {t('passkeys.removeAll', 'Remove all')}
      </Button>
      <AlertDialog open={confirming} onOpenChange={(open) => !busy && setConfirming(open)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('passkeys.removeAllTitle', 'Remove all {{count}} passkeys?', { count: ids.length })}
            </AlertDialogTitle>
            <AlertDialogDescription>{removalWarning(t, own)}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(e) => {
                e.preventDefault();
                void removeAll();
              }}
            >
              {t('passkeys.removeAll', 'Remove all')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function AddPasskey({ accountId, onChanged }: { accountId: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  // The registration link, shown when the browser blocked the new window
  const [link, setLink] = useState<string | null>(null);
  const watcher = useRef<number | null>(null);
  const problem = name ? nameMessage(t, name) : null;

  useEffect(
    () => () => {
      if (watcher.current !== null) window.clearInterval(watcher.current);
    },
    [],
  );

  const add = async () => {
    setBusy(true);
    setLink(null);
    try {
      const url = await createPasskey(accountId, name);
      setName('');
      onChanged();
      const opened = window.open(url, '_blank');
      if (!opened) {
        setLink(url);
        return;
      }
      // Refresh once the registration window closes
      if (watcher.current !== null) window.clearInterval(watcher.current);
      watcher.current = window.setInterval(() => {
        if (opened.closed) {
          if (watcher.current !== null) window.clearInterval(watcher.current);
          watcher.current = null;
          onChanged();
        }
      }, 1000);
    } catch (e) {
      const description =
        e instanceof PasskeyRefused && e.kind === 'forbidden'
          ? t('passkeys.forbidden', 'Passkeys are turned off for this account.')
          : e instanceof PasskeyRefused && e.kind === 'overQuota'
            ? t('passkeys.overQuota', 'This account has as many passkeys as it may. Remove one first.')
            : e instanceof Error
              ? e.message
              : String(e);
      toast({ variant: 'destructive', title: t('passkeys.addFailed', 'The passkey wasn’t added'), description });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('passkeys.namePlaceholder', 'Name, e.g. Phone or YubiKey')}
          aria-label={t('passkeys.name', 'Name')}
          className="h-8 w-64"
        />
        <Button size="sm" onClick={add} disabled={busy || !name.trim() || !!problem}>
          {busy ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Plus className="mr-1 h-3.5 w-3.5" />}
          {t('passkeys.add', 'Add a passkey')}
        </Button>
      </div>
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      <p className="text-xs text-muted-foreground">
        {t(
          'passkeys.addHint',
          'Opens the server’s registration page in a new window, where you confirm with your password and then your passkey.',
        )}
      </p>
      {link && (
        <p className="text-xs">
          {t(
            'passkeys.blocked',
            'The browser blocked the new window. Open the registration page here; the link works for 10 minutes and only once:',
          )}{' '}
          <a href={link} target="_blank" rel="noreferrer" className="underline" onClick={() => setLink(null)}>
            {t('passkeys.openRegistration', 'Open the registration page')}
          </a>
        </p>
      )}
    </div>
  );
}
