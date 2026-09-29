/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Audit Log (audit-hold-lock spec, AU-9 to
 * AU-11). Who changed what, who signed in as an administrator, and who
 * reached another account's data; filtered, paged newest first, exported as
 * a file the server builds, and checked against tampering.
 *
 * Records can't be edited or deleted from here or anywhere else: that is the
 * point of them. A tenant administrator sees its own tenant's records; the
 * server decides that, not this page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Download, Loader2, RotateCcw, Search, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  AUDIT_ACTIONS,
  AuditUnavailable,
  EMPTY_FILTER,
  PAGE_SIZE,
  exportEvents,
  fetchKeepForDays,
  queryEvents,
  updateKeepForDays,
  verifyChains,
  type AuditAction,
  type AuditChange,
  type AuditEvent,
  type AuditFilterInput,
  type AuditOutcome,
  type Verification,
} from './auditLog';
import { formatValue, targetKindLabel, targetName } from './format';
import { actionLabel, viaLabel } from './labels';

/** What was last loaded, and for which filter and page. */
type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; key: string; events: AuditEvent[]; total: number }
  | { kind: 'error'; key: string; message: string };

const ANY = '__any__';

export function AuditLogPage() {
  const { t } = useTranslation();
  const canExport = useAccountStore((s) => s.hasPermission('sysAuditExport'));
  // Retention and verification are the server's: tenant administrators hold neither
  const canManage = useAccountStore((s) => s.hasPermission('sysAuditSettingsUpdate'));

  const [draft, setDraft] = useState<AuditFilterInput>(EMPTY_FILTER);
  const [filter, setFilter] = useState<AuditFilterInput>(EMPTY_FILTER);
  const [position, setPosition] = useState(0);
  // Bumped to fetch again: Show, Clear, and after this page's own actions,
  // which are recorded too
  const [fetches, setFetches] = useState(0);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const [exporting, setExporting] = useState(false);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [keepForDays, setKeepForDays] = useState<number | null>(null);
  const [editingRetention, setEditingRetention] = useState(false);

  // A page that belongs to another filter or position shows as loading
  const key = JSON.stringify([filter, position, fetches]);
  const shown: Load = load.kind !== 'loading' && load.key === key ? load : { kind: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    queryEvents(filter, position, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setLoad({ kind: 'ready', key, events: page.events, total: page.total });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          key,
          message:
            e instanceof AuditUnavailable
              ? t('audit.unavailable', 'This server does not keep an audit log.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [filter, position, key, t]);

  useEffect(() => {
    fetchKeepForDays()
      .then(setKeepForDays)
      .catch(() => setKeepForDays(null));
  }, []);

  const apply = useCallback(() => {
    setPosition(0);
    setFilter(draft);
    refetch();
  }, [draft, refetch]);

  const clear = useCallback(() => {
    setDraft(EMPTY_FILTER);
    setPosition(0);
    setFilter(EMPTY_FILTER);
    refetch();
  }, [refetch]);

  const verify = useCallback(async () => {
    setVerifying(true);
    try {
      setVerification(await verifyChains());
      refetch();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('audit.verifyFailed', 'The check could not run'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setVerifying(false);
    }
  }, [refetch, t]);

  const filtered = useMemo(() => JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER), [filter]);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon="shield-check"
        title={t('audit.title', 'Audit log')}
        subtitle={
          <>
            {t(
              'audit.subtitle',
              'Every change administrators and the server made, administrator sign-ins, and access to other accounts. Records can’t be edited or deleted.',
            )}{' '}
            {keepForDays !== null && (
              <span>
                {t('audit.keptFor', 'Kept for {{days}} days.', { days: keepForDays })}{' '}
                {canManage && (
                  <button type="button" className="underline" onClick={() => setEditingRetention(true)}>
                    {t('audit.change', 'Change')}
                  </button>
                )}
              </span>
            )}
          </>
        }
        actions={
          <>
            {canManage && (
              <Button variant="outline" onClick={() => void verify()} disabled={verifying}>
                {verifying ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ShieldCheck className="mr-2 h-4 w-4" />
                )}
                {t('audit.verify', 'Check for tampering')}
              </Button>
            )}
            {canExport && (
              <Button onClick={() => setExporting(true)}>
                <Download className="mr-2 h-4 w-4" />
                {t('audit.export', 'Export…')}
              </Button>
            )}
          </>
        }
      />

      <Filters draft={draft} setDraft={setDraft} onApply={apply} onClear={clear} />

      {shown.kind === 'loading' && <LoadingFallback />}
      {shown.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{shown.message}</div>
      )}
      {shown.kind === 'ready' && (
        <>
          <EventTable events={shown.events} onSelect={setSelected} filtered={filtered} />
          <Pager
            position={position}
            count={shown.events.length}
            total={shown.total}
            onPrevious={() => setPosition(Math.max(0, position - PAGE_SIZE))}
            onNext={() => setPosition(position + PAGE_SIZE)}
          />
        </>
      )}

      <EventDetail event={selected} onClose={() => setSelected(null)} />
      {exporting && (
        <ExportDialog
          filter={filter}
          onClose={() => {
            setExporting(false);
            refetch();
          }}
        />
      )}
      <VerificationDialog result={verification} onClose={() => setVerification(null)} />
      {editingRetention && keepForDays !== null && (
        <RetentionDialog
          days={keepForDays}
          onClose={() => setEditingRetention(false)}
          onSaved={(days) => {
            setKeepForDays(days);
            setEditingRetention(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function OutcomeBadge({ outcome }: { outcome: AuditOutcome }) {
  const { t } = useTranslation();
  switch (outcome.status) {
    case 'success':
      return <Badge variant="secondary">{t('audit.outcome.success', 'Done')}</Badge>;
    case 'refused':
      return (
        <Badge variant="destructive" title={outcome.description ?? outcome.error}>
          {t('audit.outcome.refused', 'Refused')}
        </Badge>
      );
    case 'pending':
      return (
        <Badge variant="outline" title={t('audit.outcome.pendingHint', 'The server stopped before it finished.')}>
          {t('audit.outcome.pending', 'Unfinished')}
        </Badge>
      );
  }
}

function Filters({
  draft,
  setDraft,
  onApply,
  onClear,
}: {
  draft: AuditFilterInput;
  setDraft: (f: AuditFilterInput) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const set = <K extends keyof AuditFilterInput>(key: K, value: AuditFilterInput[K]) =>
    setDraft({ ...draft, [key]: value });
  return (
    <form
      className="grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-2 lg:grid-cols-6"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <label className="space-y-1 text-sm lg:col-span-2">
        <span className="text-muted-foreground">{t('audit.filter.text', 'Search')}</span>
        <Input
          value={draft.text}
          placeholder={t('audit.filter.textHint', 'Name, address, object, reason…')}
          onChange={(e) => set('text', e.target.value)}
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t('audit.filter.from', 'From')}</span>
        <Input type="date" value={draft.from} onChange={(e) => set('from', e.target.value)} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t('audit.filter.to', 'To')}</span>
        <Input type="date" value={draft.to} onChange={(e) => set('to', e.target.value)} />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t('audit.filter.action', 'What happened')}</span>
        <Select value={draft.action || ANY} onValueChange={(v) => set('action', v === ANY ? '' : (v as AuditAction))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('audit.filter.any', 'Anything')}</SelectItem>
            {AUDIT_ACTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {actionLabel(t, a)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-muted-foreground">{t('audit.filter.outcome', 'Outcome')}</span>
        <Select
          value={draft.outcome || ANY}
          onValueChange={(v) => set('outcome', v === ANY ? '' : (v as AuditFilterInput['outcome']))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('audit.filter.any', 'Anything')}</SelectItem>
            <SelectItem value="success">{t('audit.outcome.success', 'Done')}</SelectItem>
            <SelectItem value="refused">{t('audit.outcome.refused', 'Refused')}</SelectItem>
            <SelectItem value="pending">{t('audit.outcome.pending', 'Unfinished')}</SelectItem>
          </SelectContent>
        </Select>
      </label>
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-6">
        <Button type="submit" size="sm">
          <Search className="mr-2 h-4 w-4" />
          {t('audit.filter.apply', 'Show')}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('audit.filter.clear', 'Clear')}
        </Button>
      </div>
    </form>
  );
}

function EventTable({
  events,
  onSelect,
  filtered,
}: {
  events: AuditEvent[];
  onSelect: (e: AuditEvent) => void;
  filtered: boolean;
}) {
  const { t } = useTranslation();
  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {filtered
          ? t('audit.noneMatching', 'No records match these filters.')
          : t('audit.none', 'Nothing has been recorded yet.')}
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t('audit.col.when', 'When')}</th>
            <th className="px-4 py-2 font-medium">{t('audit.col.who', 'Who')}</th>
            <th className="px-4 py-2 font-medium">{t('audit.col.what', 'What')}</th>
            <th className="px-4 py-2 font-medium">{t('audit.col.target', 'To')}</th>
            <th className="px-4 py-2 font-medium">{t('audit.col.outcome', 'Outcome')}</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr
              key={event.id}
              className="cursor-pointer border-t hover:bg-muted/40"
              onClick={() => onSelect(event)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSelect(event);
              }}
            >
              <td className="whitespace-nowrap px-4 py-2 tabular-nums text-muted-foreground">
                {new Date(event.at).toLocaleString()}
              </td>
              <td className="px-4 py-2">
                <div className={cn(event.actor.accountId ? 'font-medium' : 'italic text-muted-foreground')}>
                  {event.actor.name}
                </div>
                {event.via && <div className="text-xs text-muted-foreground">{viaLabel(t, event.via)}</div>}
              </td>
              <td className="px-4 py-2">{actionLabel(t, event.action)}</td>
              <td className="px-4 py-2">
                <span className="text-muted-foreground">{targetKindLabel(event.target.kind)}</span>{' '}
                {targetName(event.target)}
              </td>
              <td className="px-4 py-2">
                <OutcomeBadge outcome={event.outcome} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Pager({
  position,
  count,
  total,
  onPrevious,
  onNext,
}: {
  position: number;
  count: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between text-sm text-muted-foreground">
      <span>
        {t('audit.showing', 'Showing {{from}}–{{to}} of {{total}}', {
          from: position + 1,
          to: position + count,
          total,
        })}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={position === 0} onClick={onPrevious}>
          <ChevronLeft className="h-4 w-4" />
          {t('audit.previous', 'Newer')}
        </Button>
        <Button size="sm" variant="outline" disabled={position + count >= total} onClick={onNext}>
          {t('audit.next', 'Older')}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function EventDetail({ event, onClose }: { event: AuditEvent | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle>
                {actionLabel(t, event.action)} · {targetKindLabel(event.target.kind)}{' '}
                {targetName(event.target)}
              </DialogTitle>
              <DialogDescription>{new Date(event.at).toLocaleString()}</DialogDescription>
            </DialogHeader>
            <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">{t('audit.detail.who', 'Who')}</dt>
              <dd>
                {event.actor.name}
                {event.via && <span className="text-muted-foreground"> · {viaLabel(t, event.via)}</span>}
              </dd>
              {event.remoteIp && (
                <>
                  <dt className="text-muted-foreground">{t('audit.detail.from', 'From')}</dt>
                  <dd className="font-mono">{event.remoteIp}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('audit.detail.outcome', 'Outcome')}</dt>
              <dd className="flex items-center gap-2">
                <OutcomeBadge outcome={event.outcome} />
                {event.outcome.status === 'refused' && (
                  <span className="text-muted-foreground">
                    {event.outcome.description ?? event.outcome.error}
                  </span>
                )}
              </dd>
              {event.reason && (
                <>
                  <dt className="text-muted-foreground">{t('audit.detail.reason', 'Reason given')}</dt>
                  <dd>{event.reason}</dd>
                </>
              )}
              {event.details && (
                <>
                  <dt className="text-muted-foreground">{t('audit.detail.details', 'Details')}</dt>
                  <dd className="break-words">{event.details}</dd>
                </>
              )}
              <dt className="text-muted-foreground">{t('audit.detail.record', 'Record')}</dt>
              <dd className="font-mono text-xs text-muted-foreground">
                {event.id} · {t('audit.detail.node', 'node {{node}}', { node: event.node })}
              </dd>
            </dl>
            {event.changes.length > 0 && <ChangeTable changes={event.changes} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ChangeTable({ changes }: { changes: AuditChange[] }) {
  const { t } = useTranslation();
  return (
    <div className="max-h-80 overflow-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 font-medium">{t('audit.changes.field', 'Setting')}</th>
            <th className="px-3 py-1.5 font-medium">{t('audit.changes.before', 'Before')}</th>
            <th className="px-3 py-1.5 font-medium">{t('audit.changes.after', 'After')}</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((change) => (
            <tr key={change.field} className="border-t align-top">
              <td className="px-3 py-1.5 font-mono text-xs">{change.field}</td>
              {change.redacted ? (
                <td colSpan={2} className="px-3 py-1.5 italic text-muted-foreground">
                  {t('audit.changes.secret', 'Changed. Secrets are never recorded.')}
                </td>
              ) : (
                <>
                  <td className="break-all px-3 py-1.5 font-mono text-xs text-muted-foreground">
                    {formatValue(change.before)}
                  </td>
                  <td className="break-all px-3 py-1.5 font-mono text-xs">{formatValue(change.after)}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExportDialog({ filter, onClose }: { filter: AuditFilterInput; onClose: () => void }) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<'csv' | 'jsonl'>('csv');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const result = await exportEvents(filter, format, reason);
      toast({
        title: t('audit.exported', 'Exported {{count}} records', { count: result.count }),
        description: (
          <span className="break-all font-mono text-xs">
            {t('audit.exportedHash', 'SHA-256 {{hash}}', { hash: result.sha256 })}
          </span>
        ),
      });
      onClose();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('audit.exportFailed', 'Nothing was exported'),
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
          <DialogTitle>{t('audit.exportTitle', 'Export the audit log')}</DialogTitle>
          <DialogDescription>
            {t(
              'audit.exportBody',
              'The records the filters above match, up to 100,000, newest first. Each line carries its chain hash, and the file ends with a manifest, so whoever receives it can check it. The export itself is recorded.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <label className="block space-y-1">
            <span className="text-muted-foreground">{t('audit.format', 'Format')}</span>
            <Select value={format} onValueChange={(v) => setFormat(v as 'csv' | 'jsonl')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">{t('audit.formatCsv', 'CSV (spreadsheets)')}</SelectItem>
                <SelectItem value="jsonl">{t('audit.formatJsonl', 'JSON Lines (tools, SIEM)')}</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-muted-foreground">{t('audit.reason', 'Reason (optional)')}</span>
            <Textarea
              value={reason}
              maxLength={500}
              placeholder={t('audit.reasonHint', 'Ticket, request or case this is for')}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('audit.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void run()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('audit.exportGo', 'Export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VerificationDialog({ result, onClose }: { result: Verification | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {result && (
          <>
            <DialogHeader>
              <DialogTitle className={cn(!result.verified && 'text-destructive')}>
                {result.verified
                  ? t('audit.verified', 'No tampering found')
                  : t('audit.broken', 'The audit log was changed')}
              </DialogTitle>
              <DialogDescription>
                {result.verified
                  ? t(
                      'audit.verifiedBody',
                      'Every record on every node follows from the one before it. This catches edits to the store; it can’t stop someone with root on the server rewriting everything, so forward records to a system your mail administrators don’t control as well.',
                    )
                  : t(
                      'audit.brokenBody',
                      'At least one record doesn’t follow from the one before it. Keep the server as it is and compare against an export or a forwarded copy.',
                    )}
              </DialogDescription>
            </DialogHeader>
            <ul className="space-y-2 text-sm">
              {result.chains.map((chain) => (
                <li key={chain.node} className="rounded-lg border p-3">
                  <div className="font-medium">
                    {t('audit.chainNode', 'Node {{node}}', { node: chain.node })}:{' '}
                    {chain.brokenAt
                      ? t('audit.chainBroken', 'broken at record {{at}}', { at: chain.brokenAt })
                      : t('audit.chainOk', '{{count}} entries verified', { count: chain.entries })}
                  </div>
                  {chain.reason && <div className="text-muted-foreground">{chain.reason}</div>}
                  {chain.unfinished > 0 && (
                    <div className="text-muted-foreground">
                      {t('audit.chainUnfinished', '{{count}} changes never recorded an outcome.', {
                        count: chain.unfinished,
                      })}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function RetentionDialog({
  days,
  onClose,
  onSaved,
}: {
  days: number;
  onClose: () => void;
  onSaved: (days: number) => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(days));
  const [busy, setBusy] = useState(false);
  const parsed = Number(value);
  const valid = Number.isInteger(parsed) && parsed >= 90;

  const save = async () => {
    setBusy(true);
    try {
      await updateKeepForDays(parsed);
      onSaved(parsed);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('audit.retentionFailed', 'Not saved'),
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
          <DialogTitle>{t('audit.retentionTitle', 'How long records are kept')}</DialogTitle>
          <DialogDescription>
            {t(
              'audit.retentionBody',
              'Older records are removed once a day. At least 90 days; the default is two years. This change is recorded too.',
            )}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('audit.retentionDays', 'Days')}</span>
          <Input type="number" min={90} value={value} onChange={(e) => setValue(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('audit.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || !valid}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('audit.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
