/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: placing, widening and releasing a legal hold (audit-hold-lock
 * spec, LH-1, LH-3, LH-10). Every change needs a reason (AU-12); a release
 * also needs the case name typed, since it lets things expire.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Scale, Unlock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ObjectPicker } from '@/components/common/ObjectPicker';
import { useObjectLabel } from '@/lib/objectOptions';
import { useSchemaStore } from '@/stores/schemaStore';
import { toast } from '@/hooks/use-toast';
import {
  draftProblem,
  EMPTY_SCOPE,
  narrowingProblem,
  placeHold,
  releaseHold,
  updateHold,
  type HoldDraft,
  type HoldScope,
  type LegalHold,
} from './legalHold';

type ScopeKind = 'accounts' | 'groups' | 'domains' | 'tenants';

const PICKER_VIEW: Record<ScopeKind, string> = {
  accounts: 'x:Account/User',
  groups: 'x:Account/Group',
  domains: 'x:Domain',
  tenants: 'x:Tenant',
};

/** The object each kind's ids are labelled from. */
const LABEL_OBJECT: Record<ScopeKind, string> = {
  accounts: 'x:Account',
  groups: 'x:Account',
  domains: 'x:Domain',
  tenants: 'x:Tenant',
};

function ScopeChip({ kind, id, onRemove }: { kind: ScopeKind; id: string; onRemove?: () => void }) {
  const schema = useSchemaStore((s) => s.schema);
  const { label } = useObjectLabel(LABEL_OBJECT[kind], id, schema!);
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs">
      {label ?? id}
      {onRemove && (
        <button type="button" onClick={onRemove} className="text-muted-foreground hover:text-foreground">
          <X className="h-3 w-3" />
        </button>
      )}
    </span>
  );
}

/** A hold's scope, read-only: the chips, or "the whole server". */
export function ScopeSummary({ scope }: { scope: HoldScope }) {
  const { t } = useTranslation();
  if (scope.server) return <span className="text-sm">{t('hold.wholeServer', 'Every account on the server')}</span>;
  const kinds: ScopeKind[] = ['accounts', 'groups', 'domains', 'tenants'];
  return (
    <div className="flex flex-wrap gap-1">
      {kinds.flatMap((kind) => scope[kind].map((id) => <ScopeChip key={`${kind}-${id}`} kind={kind} id={id} />))}
    </div>
  );
}

function ScopeEditor({
  scope,
  locked,
  onChange,
}: {
  scope: HoldScope;
  /** Entries already held, which can't be taken out (LH-3). */
  locked?: HoldScope;
  onChange: (s: HoldScope) => void;
}) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const rows: { kind: ScopeKind; label: string; placeholder: string }[] = [
    { kind: 'accounts', label: t('hold.scope.accounts', 'People'), placeholder: t('hold.addAccount', 'Add a person') },
    { kind: 'groups', label: t('hold.scope.groups', 'Groups'), placeholder: t('hold.addGroup', 'Add a group') },
    { kind: 'domains', label: t('hold.scope.domains', 'Domains'), placeholder: t('hold.addDomain', 'Add a domain') },
    { kind: 'tenants', label: t('hold.scope.tenants', 'Tenants'), placeholder: t('hold.addTenant', 'Add a tenant') },
  ];
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={scope.server}
          disabled={locked?.server}
          onCheckedChange={(v) => onChange({ ...scope, server: v === true })}
        />
        {t('hold.wholeServer', 'Every account on the server')}
      </label>
      {!scope.server &&
        schema &&
        rows.map(({ kind, label, placeholder }) => (
          <div key={kind} className="space-y-1 text-sm">
            <div className="text-muted-foreground">{label}</div>
            <div className="flex flex-wrap items-center gap-1">
              {scope[kind].map((id) => (
                <ScopeChip
                  key={id}
                  kind={kind}
                  id={id}
                  onRemove={
                    locked?.[kind].includes(id)
                      ? undefined
                      : () => onChange({ ...scope, [kind]: scope[kind].filter((x) => x !== id) })
                  }
                />
              ))}
              <ObjectPicker
                schema={schema}
                objectName={PICKER_VIEW[kind]}
                value=""
                onChange={(id) => {
                  if (id && !scope[kind].includes(id)) onChange({ ...scope, [kind]: [...scope[kind], id] });
                }}
                placeholder={placeholder}
              />
            </div>
          </div>
        ))}
      <p className="text-xs text-muted-foreground">
        {t(
          'hold.scopeHint',
          'Domains, groups and tenants count as they are now: an account added later is held, and one that leaves stays held.',
        )}
      </p>
    </div>
  );
}

function ReasonField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-muted-foreground">{t('hold.reason', 'Reason')}</span>
      <Textarea
        value={value}
        maxLength={500}
        placeholder={t('hold.reasonHint', 'Why, for the audit log: counsel’s letter, a matter number…')}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function toDraft(hold?: LegalHold): HoldDraft {
  return {
    name: hold?.name ?? '',
    reference: hold?.reference ?? '',
    description: hold?.description ?? '',
    scope: hold ? { ...hold.scope } : { ...EMPTY_SCOPE },
    from: hold?.from ?? '',
    to: hold?.to ?? '',
  };
}

export function HoldDialog({
  existing,
  onClose,
  onDone,
}: {
  existing?: LegalHold;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<HoldDraft>(() => toDraft(existing));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = draftProblem(draft) ?? (existing ? narrowingProblem(existing, draft) : null);
  const ready = !problem && reason.trim().length > 0;
  const patch = (p: Partial<HoldDraft>) => setDraft((d) => ({ ...d, ...p }));

  const save = async () => {
    setBusy(true);
    try {
      if (existing) await updateHold(existing.id, draft, reason);
      else await placeHold(draft, reason);
      toast({
        title: existing
          ? t('hold.updated', 'Hold changed')
          : t('hold.placed', 'Hold placed. What it covers can no longer be destroyed.'),
      });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: existing ? t('hold.updateFailed', 'Nothing changed') : t('hold.placeFailed', 'The hold wasn’t placed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? t('hold.editTitle', 'Change {{name}}', { name: existing.name })
              : t('hold.placeTitle', 'Place a legal hold')}
          </DialogTitle>
          <DialogDescription>
            {existing
              ? t(
                  'hold.editBody',
                  'A hold can grow, never shrink: more accounts, or a wider date range. To hold less, release it and place a new one.',
                )
              : t(
                  'hold.placeBody',
                  'Nothing it covers can be destroyed: deletions are kept in the archive with no expiry, by any user, delegate or administrator, and deleted accounts keep their data. People aren’t told.',
                )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t('hold.name', 'Case name')}</span>
              <Input value={draft.name} maxLength={500} onChange={(e) => patch({ name: e.target.value })} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t('hold.reference', 'Reference (optional)')}</span>
              <Input
                value={draft.reference}
                maxLength={500}
                placeholder={t('hold.referenceHint', 'Matter or ticket number')}
                onChange={(e) => patch({ reference: e.target.value })}
              />
            </label>
          </div>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t('hold.description', 'Description (optional)')}</span>
            <Textarea
              value={draft.description}
              maxLength={500}
              onChange={(e) => patch({ description: e.target.value })}
            />
          </label>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t('hold.covers', 'What it covers')}</div>
            <ScopeEditor scope={draft.scope} locked={existing?.scope} onChange={(scope) => patch({ scope })} />
          </div>
          <div className="space-y-2">
            <div className="text-sm font-medium">{t('hold.range', 'Dates (optional, UTC)')}</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{t('hold.from', 'From')}</span>
                <Input type="date" value={draft.from} onChange={(e) => patch({ from: e.target.value })} />
              </label>
              <label className="block space-y-1 text-sm">
                <span className="text-muted-foreground">{t('hold.to', 'To')}</span>
                <Input type="date" value={draft.to} onChange={(e) => patch({ to: e.target.value })} />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'hold.rangeHint',
                'Leave both empty to hold everything. With dates, mail counts by when it arrived and events by when they start; contacts, files and filter scripts are held whole. Without an end, mail still to come is held too.',
              )}
            </p>
          </div>
          {problem && <p className="text-sm text-destructive">{problem}</p>}
          <ReasonField value={reason} onChange={setReason} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('hold.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !ready}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : !existing && <Scale className="mr-2 h-4 w-4" />}
            {existing ? t('hold.save', 'Save') : t('hold.placeGo', 'Place hold')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function ReleaseDialog({ hold, onClose, onDone }: { hold: LegalHold; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = typed.trim() === hold.name.trim() && reason.trim().length > 0;

  const run = async () => {
    setBusy(true);
    try {
      await releaseHold(hold.id, reason);
      toast({ title: t('hold.released', 'Hold released') });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('hold.releaseFailed', 'The hold is still in place'),
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
          <DialogTitle>{t('hold.releaseTitle', 'Release {{name}}', { name: hold.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'hold.releaseBody',
              'What only this hold kept gets its normal deadline back, and never less than 30 days from now, so a mistaken release can be undone by placing a new hold. Anything another hold covers stays held. A released hold stays listed, and can’t be put back.',
            )}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">
            {t('hold.typeName', 'Type the case name to confirm: {{name}}', { name: hold.name })}
          </span>
          <Input value={typed} onChange={(e) => setTyped(e.target.value)} />
        </label>
        <ReasonField value={reason} onChange={setReason} />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('hold.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void run()} disabled={busy || !ready}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Unlock className="mr-2 h-4 w-4" />}
            {t('hold.releaseGo', 'Release')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
