/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Journal (journaling spec, §3). Two
 * tabs: Search (who may search: find, read and export what was journaled,
 * each recorded) and Journals (what's journaled, where it goes and for how
 * long, and the check of the chain).
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Download, Eye, Loader2, Pencil, Plus, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { formatSize } from '@/features/hold/legalHold';
import { IdPicker } from '@/features/dlp/IdPicker';
import {
  deleteJournal,
  exportEntries,
  fetchJournals,
  fetchReport,
  JournalUnavailable,
  PAGE,
  saveJournal,
  searchEntries,
  setJournalEnabled,
  verifyJournal,
  type ChainReport,
} from './api';
import {
  describeJournal,
  emptyFilter,
  MAX_RETENTION_DAYS,
  MIN_RETENTION_DAYS,
  newJournal,
  problem,
  whoOf,
  type EntryFilter,
  type Journal,
  type JournalDirection,
  type JournalEntry,
  type Who,
} from './model';

function when(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

function message(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// --- Search ---------------------------------------------------------------

function ReadDialog({ entry, onClose }: { entry: JournalEntry; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    fetchReport(entry.id)
      .then(setText)
      .catch((e: unknown) => setFailed(message(e)));
  }, [entry.id]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{entry.subject || t('journal.noSubject', '(no subject)')}</DialogTitle>
          <DialogDescription>
            {t(
              'journal.readRecorded',
              'The journal report: the envelope, then the message as it was sent. Reading it is recorded in the audit log.',
            )}
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive">{failed}</p>
        ) : text === null ? (
          <LoadingFallback />
        ) : (
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 text-xs">
            {text}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportDialog({ filter, total, onClose }: { filter: EntryFilter; total: number; onClose: () => void }) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { count, sha256 } = await exportEntries(filter, reason);
      toast({
        title: t('journal.exported', '{{count}} reports exported', { count }),
        description: t('journal.exportedHash', 'SHA-256 {{sha256}}', { sha256 }),
      });
      onClose();
    } catch (e) {
      toast({ variant: 'destructive', title: t('journal.exportFailed', 'Not exported'), description: message(e) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('journal.exportTitle', 'Export {{count}} reports', { count: total })}</DialogTitle>
          <DialogDescription>
            {t(
              'journal.exportBody',
              'A ZIP of the journal reports this search finds, with a manifest that lists each one’s SHA-256. The export and its reason are recorded in the audit log.',
            )}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.reason', 'Reason, for the audit log')}</span>
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('journal.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void run()} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            {t('journal.export', 'Export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type Results = { entries: JournalEntry[]; total: number; filter: EntryFilter };

function SearchTab({ journals }: { journals: Journal[] }) {
  const { t } = useTranslation();
  const canExport = useAccountStore((s) => s.hasPermission('sysJournalExport'));
  const [filter, setFilter] = useState<EntryFilter>(emptyFilter());
  const [results, setResults] = useState<Results | null>(null);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState<JournalEntry | null>(null);
  const [exporting, setExporting] = useState(false);
  const patch = (next: Partial<EntryFilter>) => setFilter((f) => ({ ...f, ...next }));
  const journalName = (id: string) => journals.find((j) => j.id === id)?.name ?? id;

  const run = async (from: EntryFilter, position: number) => {
    setBusy(true);
    try {
      const page = await searchEntries(from, position);
      setResults((current) => ({
        entries: position === 0 || !current ? page.entries : [...current.entries, ...page.entries],
        total: page.total,
        filter: from,
      }));
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('journal.searchFailed', 'The search didn’t run'),
        description: message(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void run(filter, 0);
        }}
      >
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.address', 'Sender or recipient')}</span>
          <Input
            value={filter.address}
            placeholder="name@example.com"
            onChange={(e) => patch({ address: e.target.value })}
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.subjectWords', 'Words in the subject')}</span>
          <Input value={filter.text} onChange={(e) => patch({ text: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.which', 'Which mail')}</span>
          <Select value={filter.direction} onValueChange={(d) => patch({ direction: d as JournalDirection })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">{t('journal.dirAny', 'All mail')}</SelectItem>
              <SelectItem value="outgoing">{t('journal.dirOutgoing', 'Sent outside')}</SelectItem>
              <SelectItem value="incoming">{t('journal.dirIncoming', 'Arriving from outside')}</SelectItem>
              <SelectItem value="internal">{t('journal.dirInternal', 'Between people here')}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.from', 'From (date)')}</span>
          <Input type="date" value={filter.from} onChange={(e) => patch({ from: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.to', 'To (date)')}</span>
          <Input type="date" value={filter.to} onChange={(e) => patch({ to: e.target.value })} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.inJournal', 'Journal')}</span>
          <Select
            value={filter.journalId || '__all__'}
            onValueChange={(id) => patch({ journalId: id === '__all__' ? '' : id })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">{t('journal.anyJournal', 'Any journal')}</SelectItem>
              {journals.map((j) => (
                <SelectItem key={j.id} value={j.id ?? ''}>
                  {j.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
          <Button type="submit" disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            {t('journal.search', 'Search')}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t('journal.searchRecorded', 'Each search is recorded in the audit log, with what was searched for.')}
          </span>
        </div>
      </form>

      {results && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {t('journal.found', '{{count}} found', { count: results.total })}
          </p>
          {canExport && results.total > 0 && (
            <Button variant="outline" size="sm" onClick={() => setExporting(true)}>
              <Download className="mr-2 h-4 w-4" />
              {t('journal.exportAction', 'Export…')}
            </Button>
          )}
        </div>
      )}
      {results && results.entries.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('journal.nothingFound', 'Nothing journaled matches.')}
        </div>
      )}
      {results?.entries.map((entry) => (
        <section key={entry.id} className="space-y-2 rounded-xl border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{entry.subject || t('journal.noSubject', '(no subject)')}</p>
              <p className="break-all text-sm text-muted-foreground">
                {t('journal.fromTo', '{{sender}} to {{to}}', {
                  sender: entry.sender || '<>',
                  to: entry.recipients.join(', '),
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {when(entry.receivedAt)} · {formatSize(entry.size)} ·{' '}
                {t('journal.keptUntil', 'kept until {{date}}', {
                  date: new Date(entry.expiresAt).toLocaleDateString(),
                })}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setReading(entry)}>
              <Eye className="mr-2 h-4 w-4" />
              {t('journal.read', 'Read…')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {entry.direction === 'outgoing'
                ? t('journal.dirOutgoing', 'Sent outside')
                : entry.direction === 'incoming'
                  ? t('journal.dirIncoming', 'Arriving from outside')
                  : t('journal.dirInternal', 'Between people here')}
            </Badge>
            {entry.held && <Badge variant="secondary">{t('journal.heldBadge', 'Held for review')}</Badge>}
            {entry.journalIds.map((id) => (
              <Badge key={id} variant="secondary">
                {journalName(id)}
              </Badge>
            ))}
          </div>
        </section>
      ))}
      {results && results.entries.length < results.total && (
        <Button variant="outline" disabled={busy} onClick={() => void run(results.filter, results.entries.length)}>
          {t('journal.more', 'Show {{count}} more', { count: Math.min(PAGE, results.total - results.entries.length) })}
        </Button>
      )}
      {reading && <ReadDialog entry={reading} onClose={() => setReading(null)} />}
      {exporting && results && (
        <ExportDialog filter={results.filter} total={results.total} onClose={() => setExporting(false)} />
      )}
    </div>
  );
}

// --- Journals -------------------------------------------------------------

function JournalEditor({ initial, onClose, onSaved }: { initial: Journal; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [journal, setJournal] = useState<Journal>(initial);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const patch = (next: Partial<Journal>) => setJournal((j) => ({ ...j, ...next }));
  const scope = journal.scope;
  const setScope = (next: Partial<Journal['scope']>) => patch({ scope: { ...scope, ...next } });
  const [who, setWho] = useState<Who>(whoOf(initial.scope));
  const issue =
    who === 'chosen' && whoOf(scope) !== 'chosen' ? t('journal.chooseSomeone', 'Choose who.') : problem(journal);

  const chooseWho = (next: Who) => {
    setWho(next);
    if (next === 'everyone') setScope({ everyone: true, accounts: [], groups: [], domains: [], tenants: [] });
    if (next === 'rules') setScope({ everyone: false, accounts: [], groups: [], domains: [], tenants: [] });
    if (next === 'chosen') setScope({ everyone: false });
  };

  const save = async () => {
    setBusy(true);
    try {
      await saveJournal(journal, reason);
      toast({ title: t('journal.saved', 'Journal saved') });
      onSaved();
    } catch (e) {
      toast({ variant: 'destructive', title: t('journal.notSaved', 'Not saved'), description: message(e) });
    } finally {
      setBusy(false);
    }
  };

  const whoChoices: { value: Who; label: string; body: string }[] = [
    {
      value: 'everyone',
      label: t('journal.whoEveryone', 'Everyone'),
      body: t('journal.whoEveryoneBody', 'All mail this server handles, in the direction below.'),
    },
    {
      value: 'chosen',
      label: t('journal.whoChosen', 'Chosen people'),
      body: t('journal.whoChosenBody', 'Mail to or from accounts, groups, domains or tenants you choose.'),
    },
    {
      value: 'rules',
      label: t('journal.whoRules', 'Only what rules send'),
      body: t('journal.whoRulesBody', 'Mail a mail flow or DLP rule sends here with Journal it.'),
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {journal.id
              ? t('journal.editTitle', 'Change “{{name}}”', { name: initial.name })
              : t('journal.newTitle', 'New journal')}
          </DialogTitle>
          <DialogDescription>{describeJournal(journal)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t('journal.name', 'Name')}</span>
            <Input value={journal.name} onChange={(e) => patch({ name: e.target.value })} />
          </label>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <Switch checked={journal.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
            {t('journal.on', 'On')}
          </label>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('journal.description', 'Description (optional)')}</span>
          <Textarea rows={2} value={journal.description} onChange={(e) => patch({ description: e.target.value })} />
        </label>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('journal.whose', 'Whose mail')}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
            {whoChoices.map((choice) => (
              <button
                key={choice.value}
                type="button"
                onClick={() => chooseWho(choice.value)}
                className={`rounded-md border p-3 text-left text-sm ${who === choice.value ? 'border-primary bg-primary/5' : ''}`}
              >
                <p className="font-medium">{choice.label}</p>
                <p className="text-xs text-muted-foreground">{choice.body}</p>
              </button>
            ))}
          </div>
          {who === 'chosen' && (
            <div className="space-y-2 rounded-md border p-3 text-sm">
              <IdPicker
                objectName="x:Account"
                labelObject="x:Account"
                ids={scope.accounts}
                onChange={(accounts) => setScope({ accounts })}
                placeholder={t('journal.addAccount', 'Add an account…')}
              />
              <IdPicker
                objectName="x:Account/Group"
                labelObject="x:Account"
                ids={scope.groups}
                onChange={(groups) => setScope({ groups })}
                placeholder={t('journal.addGroup', 'Add a group…')}
              />
              <IdPicker
                objectName="x:Domain"
                labelObject="x:Domain"
                ids={scope.domains}
                onChange={(domains) => setScope({ domains })}
                placeholder={t('journal.addDomain', 'Add a domain…')}
              />
              <IdPicker
                objectName="x:Tenant"
                labelObject="x:Tenant"
                ids={scope.tenants}
                onChange={(tenants) => setScope({ tenants })}
                placeholder={t('journal.addTenant', 'Add a tenant…')}
              />
            </div>
          )}
          {who !== 'rules' && (
            <label className="block space-y-1 text-sm">
              <span className="text-muted-foreground">{t('journal.which', 'Which mail')}</span>
              <Select value={journal.direction} onValueChange={(d) => patch({ direction: d as JournalDirection })}>
                <SelectTrigger className="w-72">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">{t('journal.dirAny', 'All mail')}</SelectItem>
                  <SelectItem value="outgoing">{t('journal.dirOutgoing', 'Sent outside')}</SelectItem>
                  <SelectItem value="incoming">{t('journal.dirIncoming', 'Arriving from outside')}</SelectItem>
                  <SelectItem value="internal">{t('journal.dirInternal', 'Between people here')}</SelectItem>
                </SelectContent>
              </Select>
            </label>
          )}
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-semibold">{t('journal.whereTitle', 'Where it goes')}</h3>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={journal.builtIn} onCheckedChange={(on) => patch({ builtIn: on === true })} />
            {t('journal.builtIn', 'The built-in journal, searchable here')}
          </label>
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">
              {t('journal.archiveAddress', 'An outside archive’s journal address (optional)')}
            </span>
            <Input
              className="w-96 max-w-full"
              placeholder="journal@archive.example"
              value={journal.archiveAddress ?? ''}
              onChange={(e) => patch({ archiveAddress: e.target.value || null })}
            />
            <span className="block text-xs text-muted-foreground">
              {t(
                'journal.archiveHint',
                'Each report is sent there as mail. One the archive doesn’t take is kept in the built-in journal instead, and shown here.',
              )}
            </span>
          </label>
        </section>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">
            {t('journal.retention', 'Keep entries for (days, {{min}} to {{max}})', {
              min: MIN_RETENTION_DAYS,
              max: MAX_RETENTION_DAYS,
            })}
          </span>
          <Input
            type="number"
            className="w-32"
            min={MIN_RETENTION_DAYS}
            max={MAX_RETENTION_DAYS}
            value={journal.retentionDays}
            onChange={(e) => patch({ retentionDays: Number(e.target.value) })}
          />
          <span className="block text-xs text-muted-foreground">
            {t(
              'journal.retentionHint',
              'Each entry keeps the time it was written with: changing this applies to new entries. Entries about someone under a legal hold stay while the hold does.',
            )}
          </span>
        </label>

        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">
            {t('journal.changeReason', 'Reason, for the audit log (optional)')}
          </span>
          <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        {issue && <p className="text-sm text-muted-foreground">{issue}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('journal.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={busy || issue !== null}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t('journal.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CheckResult({ chains, verified }: { chains: ChainReport[]; verified: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={`rounded-md border p-3 text-sm ${verified ? '' : 'border-destructive'}`}>
      <p className="font-medium">
        {verified
          ? t('journal.checkOk', 'The journal checks out: nothing was changed or removed before its time.')
          : t('journal.checkBroken', 'The journal doesn’t check out.')}
      </p>
      {chains.map((chain) => (
        <p key={chain.node} className="text-xs text-muted-foreground">
          {chain.brokenAt
            ? t('journal.chainBroken', 'Node {{node}}: at {{at}}, {{reason}}', {
                node: chain.node,
                at: chain.brokenAt,
                reason: chain.reason ?? '',
              })
            : t('journal.chainOk', 'Node {{node}}: {{entries}} entries, {{purged}} past their time and purged', {
                node: chain.node,
                entries: chain.entries,
                purged: chain.purged,
              })}
        </p>
      ))}
    </div>
  );
}

function JournalsTab({ journals, onChanged }: { journals: Journal[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const canChange = useAccountStore((s) => s.hasPermission('sysJournalUpdate'));
  const [editing, setEditing] = useState<Journal | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<{ verified: boolean; chains: ChainReport[] } | null>(null);

  const act = async (work: () => Promise<void>) => {
    try {
      await work();
      onChanged();
    } catch (e) {
      toast({ variant: 'destructive', title: t('journal.notSaved', 'Not saved'), description: message(e) });
    }
  };

  const runCheck = async () => {
    setChecking(true);
    try {
      setCheck(await verifyJournal());
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('journal.checkFailed', 'The check didn’t run'),
        description: message(e),
      });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {canChange && (
          <Button onClick={() => setEditing(newJournal())}>
            <Plus className="mr-2 h-4 w-4" />
            {t('journal.new', 'New journal…')}
          </Button>
        )}
        <Button variant="outline" onClick={() => void runCheck()} disabled={checking}>
          {checking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
          {t('journal.check', 'Check the journal')}
        </Button>
      </div>
      {check && <CheckResult {...check} />}
      {journals.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('journal.none', 'No journals yet: nothing is journaled.')}
        </div>
      )}
      {journals.map((journal) => (
        <section key={journal.id} className={`space-y-2 rounded-xl border p-4 ${journal.enabled ? '' : 'opacity-60'}`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="font-medium">{journal.name}</p>
              <p className="text-sm">{describeJournal(journal)}</p>
              {journal.description && <p className="text-xs text-muted-foreground">{journal.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={journal.enabled}
                disabled={!canChange}
                onCheckedChange={(on) => void act(() => setJournalEnabled(journal, on))}
                aria-label={t('journal.on', 'On')}
              />
              {canChange && (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditing(journal)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('journal.edit', 'Change…')}
                  </Button>
                  {confirming === journal.id ? (
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        setConfirming(null);
                        if (journal.id) void act(() => deleteJournal(journal.id as string));
                      }}
                    >
                      {t('journal.deleteConfirm', 'Delete it; its entries stay')}
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirming(journal.id ?? null)}
                      aria-label={t('journal.delete', 'Delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          {(journal.archiveFailures?.count ?? 0) > 0 && (
            <p className="flex items-start gap-2 rounded-md bg-amber-500/10 p-2 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              {t(
                'journal.archiveFailed',
                '{{count}} reports weren’t taken by {{address}}; the last {{when}}, because {{reason}}. They’re kept in the built-in journal.',
                {
                  count: journal.archiveFailures?.count ?? 0,
                  address: journal.archiveAddress ?? '',
                  when: when(journal.archiveFailures?.lastAt),
                  reason: journal.archiveFailures?.lastReason ?? '',
                },
              )}
            </p>
          )}
        </section>
      ))}
      {editing && (
        <JournalEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

type Load = { kind: 'loading' } | { kind: 'ready'; journals: Journal[] } | { kind: 'error'; message: string };

export function JournalPage() {
  const { t } = useTranslation();
  const canSearch = useAccountStore((s) => s.hasPermission('sysJournalSearch'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchJournals(controller.signal)
      .then((journals) => !controller.signal.aborted && setLoad({ kind: 'ready', journals }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof JournalUnavailable
              ? t('journal.unavailable', 'This server doesn’t journal mail.')
              : message(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="archive"
        title={t('journal.title', 'Journal')}
        subtitle={t(
          'journal.subtitle',
          'A copy of mail as it passes, with who it was really from and to (Bcc included), kept where nobody can change or remove it until its time.',
        )}
      />
      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && (
        <Tabs defaultValue={canSearch ? 'search' : 'journals'}>
          <TabsList>
            {canSearch && <TabsTrigger value="search">{t('journal.searchTab', 'Search')}</TabsTrigger>}
            <TabsTrigger value="journals">{t('journal.journalsTab', 'Journals')}</TabsTrigger>
          </TabsList>
          {canSearch && (
            <TabsContent value="search" className="pt-4">
              <SearchTab journals={load.journals} />
            </TabsContent>
          )}
          <TabsContent value="journals" className="pt-4">
            <JournalsTab journals={load.journals} onChanged={refetch} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
