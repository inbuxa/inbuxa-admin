/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: locking an account, changing who it's handed to, and unlocking it
 * (audit-hold-lock spec, AL-1 to AL-12). Each asks why (AU-12); the answer
 * goes to the audit log.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Lock, Plus, Trash2, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ObjectPicker } from '@/components/common/ObjectPicker';
import { useSchemaStore } from '@/stores/schemaStore';
import { toast } from '@/hooks/use-toast';
import {
  ACCESS_LEVELS,
  delegateProblem,
  lockAccount,
  unlockAccount,
  updateDelegates,
  type Access,
  type AccountLock,
  type Delegate,
} from './accountLock';
import { accessLabel } from './labels';

type T = (key: string, fallback: string) => string;

function accessHint(t: T, access: Access): string {
  switch (access) {
    case 'read':
      return t('lock.access.readHint', 'Sees everything, changes nothing. Reading doesn’t even mark mail read.');
    case 'organize':
      return t('lock.access.organizeHint', 'Also flags, files and moves mail and makes folders. Never deletes.');
    case 'full':
      return t('lock.access.fullHint', 'Everything the owner could do, deleting included.');
  }
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{t('lock.reason', 'Reason')}</span>
      <Textarea
        value={value}
        maxLength={500}
        placeholder={t('lock.reasonHint', 'Why, for the audit log: a ticket, a case, “left the company”…')}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function DelegateEditor({ delegates, onChange }: { delegates: Delegate[]; onChange: (d: Delegate[]) => void }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const update = (i: number, patch: Partial<Delegate>) =>
    onChange(delegates.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div className="space-y-3">
      <div className="text-sm text-muted-foreground">
        {t(
          'lock.delegatesHint',
          'People who can open this account, beside their own mail, while it is locked. Everything they do there is recorded.',
        )}
      </div>
      {delegates.map((d, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            {schema ? (
              <ObjectPicker
                schema={schema}
                objectName="x:Account"
                value={d.accountId}
                onChange={(id) => update(i, { accountId: id })}
                placeholder={t('lock.delegateAccount', 'Choose a person')}
              />
            ) : (
              <Input value={d.accountId} onChange={(e) => update(i, { accountId: e.target.value })} />
            )}
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('lock.removeDelegate', 'Remove')}
              onClick={() => onChange(delegates.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label className="space-y-1 text-sm sm:col-span-2">
              <span className="text-muted-foreground">{t('lock.accessLabel', 'Access')}</span>
              <Select
                value={d.access}
                onValueChange={(v) => update(i, { access: v as Access, sendAs: v === 'read' ? false : d.sendAs })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACCESS_LEVELS.map((a) => (
                    <SelectItem key={a} value={a}>
                      {accessLabel(t, a)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="text-muted-foreground">{t('lock.until', 'Until (optional)')}</span>
              <Input type="date" value={d.until} onChange={(e) => update(i, { until: e.target.value })} />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">{accessHint(t, d.access)}</p>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={d.sendAs}
              disabled={d.access === 'read'}
              onCheckedChange={(v) => update(i, { sendAs: v === true })}
            />
            <span className={d.access === 'read' ? 'text-muted-foreground' : ''}>
              {t('lock.sendAs', 'May send as this account (its Sent keeps a copy)')}
            </span>
          </label>
        </div>
      ))}
      {delegates.length < 10 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([...delegates, { accountId: '', access: 'read', sendAs: false, until: '' }])}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('lock.addDelegate', 'Add a delegate')}
        </Button>
      )}
    </div>
  );
}

/** Lock an account, or change an existing lock's delegates. */
export function LockDialog({
  accountId: fixedAccountId,
  accountName,
  existing,
  onClose,
  onDone,
}: {
  accountId?: string;
  accountName?: string;
  existing?: AccountLock;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const [accountId, setAccountId] = useState(existing?.id ?? fixedAccountId ?? '');
  const [reason, setReason] = useState('');
  const [delegates, setDelegates] = useState<Delegate[]>(existing?.delegates ?? []);
  const [busy, setBusy] = useState(false);
  const problem = accountId ? delegateProblem(delegates, accountId) : null;
  const ready = !!accountId && reason.trim().length > 0 && !problem;

  const save = async () => {
    setBusy(true);
    try {
      if (existing) await updateDelegates(existing.id, delegates, reason);
      else await lockAccount(accountId, reason, delegates);
      toast({
        title: existing
          ? t('lock.updated', 'Delegates changed')
          : t('lock.locked', 'Account locked. Its open sessions were ended.'),
      });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: existing ? t('lock.updateFailed', 'Nothing changed') : t('lock.lockFailed', 'The account wasn’t locked'),
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
              ? t('lock.editTitle', 'Delegates of {{name}}', { name: existing.name })
              : t('lock.lockTitle', 'Lock an account')}
          </DialogTitle>
          {!existing && (
            <DialogDescription>
              {t(
                'lock.lockBody',
                'Mail keeps arriving, but nobody can sign in to the account, by any means, and it sends nothing on its own: no forwarding, no vacation reply, no read receipts. Open sessions end now.',
              )}
            </DialogDescription>
          )}
        </DialogHeader>
        <div className="space-y-4">
          {!existing && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t('lock.account', 'Account')}</span>
              {fixedAccountId ? (
                <div className="font-medium">{accountName ?? fixedAccountId}</div>
              ) : schema ? (
                <ObjectPicker
                  schema={schema}
                  objectName="x:Account"
                  value={accountId}
                  onChange={setAccountId}
                  placeholder={t('lock.chooseAccount', 'Choose the account to lock')}
                />
              ) : null}
            </label>
          )}
          <DelegateEditor delegates={delegates} onChange={setDelegates} />
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          <ReasonField value={reason} onChange={setReason} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('lock.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !ready} variant={existing ? 'default' : 'destructive'}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : !existing && <Lock className="mr-2 h-4 w-4" />}
            {existing ? t('lock.save', 'Save') : t('lock.lockGo', 'Lock account')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UnlockDialog({
  lock,
  onClose,
  onDone,
}: {
  lock: AccountLock;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await unlockAccount(lock.id, reason);
      toast({ title: t('lock.unlocked', 'Account unlocked') });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('lock.unlockFailed', 'The account is still locked'),
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
          <DialogTitle>{t('lock.unlockTitle', 'Unlock {{name}}', { name: lock.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'lock.unlockBody',
              'The account can sign in again and its forwarding and vacation reply resume. Delegates lose it, and any shares they had before get back what they were. The password is unchanged: if someone else may know it, set a new one on the account’s page too.',
            )}
          </DialogDescription>
        </DialogHeader>
        <ReasonField value={reason} onChange={setReason} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('lock.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void run()} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
            {t('lock.unlockGo', 'Unlock')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
