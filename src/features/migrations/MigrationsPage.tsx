/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Directory › Migrations (spec: migrations-screen;
 * inbuxa-server docs/spec/features/migrations.md). An administrator moves
 * mailboxes into this server from another one, and the server runs
 * inbuxa-migrate for them. "Guided or manual?" each time: the guide is
 * inbuxa-migrate's own five steps (where the mail is now, which accounts,
 * where to, preview, move); manual is one form. Each migration says what it
 * moved and, only when something needs attention, what. The source's secret
 * is asked for when a run needs it, sent with that action and kept in the
 * server's memory only.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  AlertTriangle,
  ArrowRightLeft,
  Download,
  Eye,
  FileUp,
  KeyRound,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Square,
  Trash2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
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
import { LaunchChoice } from '@/components/wizard/LaunchChoice';
import { WizardNote, WizardShell } from '@/components/wizard/WizardShell';
import { HelpTip } from '@/help/HelpTip';
import { fieldHelp } from '@/help/texts';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { formatSize } from '@/features/hold/legalHold';
import {
  act,
  createMigration,
  downloadCsv,
  fetchMigrations,
  MigrationsUnavailable,
  SecretNeeded,
  takePasswords,
  updateMigration,
} from './api';
import {
  actions,
  attention,
  emptyForm,
  fileName,
  formProblem,
  looksLikeGoogleKey,
  ordered,
  parseAccounts,
  percent,
  resumes,
  secretKind,
  startable,
  toCreate,
  toForm,
  toPatch,
  type Attention,
  type FormProblem,
  type Migration,
  type MigrationForm,
  type RunKind,
  type SourceKind,
} from './model';

type Load = { kind: 'loading' } | { kind: 'ready'; migrations: Migration[] } | { kind: 'error'; message: string };

/** While a run goes, the page looks again this often. */
const RUNNING_REFRESH_MS = 3_000;

function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function failed(title: string, e: unknown) {
  toast({ variant: 'destructive', title, description: errorText(e) });
}

/** Dialogs open on their first field, not on its ⓘ, whose help would pop open. */
function focusFirstField(e: Event) {
  e.preventDefault();
  (e.target as HTMLElement | null)?.querySelector<HTMLElement>('input, textarea')?.focus();
}

/** A label with the option's ⓘ, keyed `inbuxa:Migration.<field>`. */
function Field({ field, label, children }: { field: string; label: string; children: ReactNode }) {
  const id = `inbuxa:Migration.${field}`;
  return (
    <label className="block space-y-1 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        <HelpTip id={id} text={fieldHelp(id)} />
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  field,
  label,
  checked,
  onChange,
  disabled,
}: {
  field: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const id = `inbuxa:Migration.${field}`;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        {label}
        <HelpTip id={id} text={fieldHelp(id)} />
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function kindLabel(t: TFunction, kind: SourceKind): string {
  switch (kind) {
    case 'imap':
      return t('migrations.kind.imap', 'IMAP server');
    case 'jmap':
      return t('migrations.kind.jmap', 'JMAP server (inbuxa or Stalwart)');
    case 'microsoft':
      return t('migrations.kind.microsoft', 'Microsoft 365');
    case 'google':
      return t('migrations.kind.google', 'Google Workspace');
  }
}

function problemText(t: TFunction, problem: FormProblem): string {
  switch (problem) {
    case 'imapUrl':
      return t('migrations.problem.imapUrl', 'Give the IMAP server as imaps://host, or imap://host.');
    case 'imapLogin':
      return t(
        'migrations.problem.imapLogin',
        'The login has to name each account with {email} or {local}, such as {email}*master.',
      );
    case 'jmapUrl':
      return t('migrations.problem.jmapUrl', 'Give the JMAP server’s address, starting https://.');
    case 'microsoft':
      return t('migrations.problem.microsoft', 'Give the Microsoft 365 tenant and the app’s client id.');
    case 'noAccounts':
      return t('migrations.problem.noAccounts', 'List the accounts to move.');
    case 'badAccounts':
      return t('migrations.problem.badAccounts', 'Some lines aren’t addresses. Fix or remove them.');
    case 'tooManyAccounts':
      return t('migrations.problem.tooManyAccounts', 'At most 10,000 accounts in one migration. Split it.');
    case 'parallel':
      return t('migrations.problem.parallel', 'Move from 1 to 16 accounts at once.');
  }
}

function sourceLine(t: TFunction, m: Migration): string {
  switch (m.sourceKind) {
    case 'imap':
    case 'jmap':
      return `${kindLabel(t, m.sourceKind)} · ${m.source.url}`;
    case 'microsoft':
      return `${kindLabel(t, m.sourceKind)} · ${m.source.tenant}`;
    case 'google':
      return kindLabel(t, m.sourceKind);
  }
}

function runLabel(t: TFunction, run: RunKind): string {
  switch (run) {
    case 'preview':
      return t('migrations.run.preview', 'Preview');
    case 'move':
      return t('migrations.run.move', 'Move');
    case 'finalPass':
      return t('migrations.run.finalPass', 'Final pass');
  }
}

function resultLabel(t: TFunction, m: Migration): string | null {
  switch (m.result) {
    case 'done':
      return t('migrations.result.done', 'done');
    case 'unfinished':
      return t('migrations.result.unfinished', 'finished, with accounts left over');
    case 'failed':
      return t('migrations.result.failed', 'failed');
    case 'stopped':
      return t('migrations.result.stopped', 'stopped');
    case 'interrupted':
      return t('migrations.result.interrupted', 'cut off');
    default:
      return null;
  }
}

function attentionText(t: TFunction, a: Attention): string {
  switch (a.kind) {
    case 'failed':
      return a.error
        ? t('migrations.attention.failedWith', 'The last run failed: {{error}}', { error: a.error })
        : t('migrations.attention.failed', 'The last run failed.');
    case 'unfinished':
      return t('migrations.attention.unfinished', {
        count: a.count,
        defaultValue_one:
          '{{count}} account didn’t finish. See why below, then run it again: it carries on. If the source refused the login, give it a new secret first.',
        defaultValue_other:
          '{{count}} accounts didn’t finish. See why below, then run it again: it carries on. If the source refused the login, give it a new secret first.',
      });
    case 'interrupted':
      return t(
        'migrations.attention.interrupted',
        'The run was cut off when its server restarted. Run it again: it carries on, and asks for the source’s secret again.',
      );
    case 'passwords':
      return t(
        'migrations.attention.passwords',
        'The new accounts’ passwords are waiting. Download them once: the server then deletes its copy.',
      );
    case 'quiet':
      return t(
        'migrations.attention.quiet',
        'Nothing heard from the run since {{since}}. If its server went down, it will show as cut off.',
        { since: when(a.since) },
      );
  }
}

// --- The answers --------------------------------------------------------------

/** Where the mail is now: the guide's step 1. */
function SourceFields({
  form,
  set,
  locked,
}: {
  form: MigrationForm;
  set: (patch: Partial<MigrationForm>) => void;
  locked?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      {locked && (
        <p className="text-sm text-muted-foreground">
          {t('migrations.sourceLocked', 'Accounts were moved from this source, so it stays as it is.')}
        </p>
      )}
      <Field field="sourceKind" label={t('migrations.f.sourceKind', 'Where the mail is now')}>
        <Select value={form.sourceKind} onValueChange={(v) => set({ sourceKind: v as SourceKind })} disabled={locked}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(['imap', 'jmap', 'microsoft', 'google'] as SourceKind[]).map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kindLabel(t, kind)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {(form.sourceKind === 'imap' || form.sourceKind === 'jmap') && (
        <Field field="url" label={t('migrations.f.url', 'Server address')}>
          <Input
            value={form.url}
            onChange={(e) => set({ url: e.target.value })}
            placeholder={form.sourceKind === 'imap' ? 'imaps://mail.example.org' : 'https://mail.example.org'}
            disabled={locked}
            autoComplete="off"
          />
        </Field>
      )}
      {form.sourceKind === 'imap' && (
        <>
          <Field field="login" label={t('migrations.f.imapLogin', 'Login for each account')}>
            <Input
              value={form.login}
              onChange={(e) => set({ login: e.target.value })}
              placeholder="{email}*master"
              disabled={locked}
              autoComplete="off"
            />
          </Field>
          <ToggleField
            field="cleartext"
            label={t('migrations.f.cleartext', 'Allow a login without TLS')}
            checked={form.cleartext}
            onChange={(cleartext) => set({ cleartext })}
            disabled={locked}
          />
        </>
      )}
      {form.sourceKind === 'jmap' && (
        <Field field="jmapLogin" label={t('migrations.f.jmapLogin', 'Administrator login (empty for an API key)')}>
          <Input
            value={form.login}
            onChange={(e) => set({ login: e.target.value })}
            disabled={locked}
            autoComplete="off"
          />
        </Field>
      )}
      {form.sourceKind === 'microsoft' && (
        <>
          <Field field="tenant" label={t('migrations.f.tenant', 'Tenant')}>
            <Input
              value={form.tenant}
              onChange={(e) => set({ tenant: e.target.value })}
              placeholder="contoso.onmicrosoft.com"
              disabled={locked}
              autoComplete="off"
            />
          </Field>
          <Field field="clientId" label={t('migrations.f.clientId', 'App (client) id')}>
            <Input
              value={form.clientId}
              onChange={(e) => set({ clientId: e.target.value })}
              disabled={locked}
              autoComplete="off"
            />
          </Field>
        </>
      )}
      {form.sourceKind === 'google' && (
        <p className="text-sm text-muted-foreground">
          {t(
            'migrations.googleNote',
            'The service account’s key is asked for when a run starts, and kept in the server’s memory only. It needs domain-wide delegation for the Gmail scope.',
          )}
        </p>
      )}
    </div>
  );
}

/** Which accounts: the guide's step 2, pasted or read from a CSV. */
function AccountsField({ form, set }: { form: MigrationForm; set: (patch: Partial<MigrationForm>) => void }) {
  const { t } = useTranslation();
  const file = useRef<HTMLInputElement>(null);
  const { accounts, bad } = useMemo(() => parseAccounts(form.accounts), [form.accounts]);
  const readFile = async (picked: File | undefined) => {
    if (!picked) return;
    try {
      set({ accounts: await picked.text() });
    } catch (e) {
      failed(t('migrations.csvFailed', 'Couldn’t read the file'), e);
    }
  };
  return (
    <div className="space-y-2">
      <Field field="accounts" label={t('migrations.f.accounts', 'Accounts to move, one per line')}>
        <Textarea
          value={form.accounts}
          onChange={(e) => set({ accounts: e.target.value })}
          rows={8}
          className="font-mono text-xs"
          placeholder={'ann@example.org\nbob@example.org'}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">
          {t('migrations.accountsCount', {
            count: accounts.length,
            defaultValue_one: '{{count}} account',
            defaultValue_other: '{{count}} accounts',
          })}
          {bad.length > 0 &&
            ` · ${t('migrations.accountsBad', 'not addresses: {{lines}}', { lines: bad.slice(0, 3).join(', ') })}`}
        </span>
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
          <FileUp className="mr-2 h-4 w-4" />
          {t('migrations.readCsv', 'Read a CSV…')}
        </Button>
        <input
          ref={file}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            void readFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>
    </div>
  );
}

/** Where to: the guide's step 3. Always this server. */
function TargetFields({ form, set }: { form: MigrationForm; set: (patch: Partial<MigrationForm>) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {t(
          'migrations.targetNote',
          'Into this server. The run writes with the rights of whoever adds the migration, and the audit log names the migration.',
        )}
      </p>
      <ToggleField
        field="createAccounts"
        label={t('migrations.f.createAccounts', 'Create the accounts this server doesn’t have yet')}
        checked={form.createAccounts}
        onChange={(createAccounts) => set({ createAccounts })}
      />
      <Field field="parallel" label={t('migrations.f.parallel', 'Accounts moved at once')}>
        <Select value={String(form.parallel)} onValueChange={(v) => set({ parallel: Number(v) })}>
          <SelectTrigger className="w-28">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[1, 2, 4, 8, 12, 16].map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field field="description" label={t('migrations.f.description', 'Name')}>
        <Input
          value={form.description}
          onChange={(e) => set({ description: e.target.value })}
          placeholder={t('migrations.descriptionPlaceholder', 'From the old mail server')}
          autoComplete="off"
        />
      </Field>
    </div>
  );
}

/** Manual: every answer at once, to add a migration or change one. */
function FormDialog({
  migration,
  onClose,
  onSaved,
}: {
  migration: Migration | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<MigrationForm>(() => (migration ? toForm(migration) : emptyForm()));
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<MigrationForm>) => setForm((f) => ({ ...f, ...patch }));
  const problem = formProblem(form);
  const save = async () => {
    setBusy(true);
    try {
      if (migration) await updateMigration(migration.id, toPatch(form, migration));
      else await createMigration(toCreate(form));
      onSaved();
    } catch (e) {
      failed(t('migrations.saveFailed', 'Not saved'), e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onOpenAutoFocus={focusFirstField}>
        <DialogHeader>
          <DialogTitle>
            {migration ? t('migrations.editTitle', 'Change the migration') : t('migrations.newTitle', 'New migration')}
          </DialogTitle>
          <DialogDescription>
            {t('migrations.formNote', 'Saving runs nothing. Preview it first, then move.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-6">
          <SourceFields form={form} set={set} locked={migration?.moved} />
          <AccountsField form={form} set={set} />
          <TargetFields form={form} set={set} />
        </div>
        {problem && <p className="text-sm text-amber-700 dark:text-amber-400">{problemText(t, problem)}</p>}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void save()} disabled={!!problem || busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('migrations.save', 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Runs -------------------------------------------------------------------

/**
 * Asks for the source's secret, for a run that needs it. It goes with the
 * action and stays in the server's memory; nothing here keeps it.
 */
function SecretDialog({
  migration,
  action,
  choose,
  onClose,
  onSecret,
}: {
  migration: Migration;
  action: RunKind;
  /** Asked for again, not by a run: say which run to start with it. */
  choose?: boolean;
  onClose: () => void;
  onSecret: (secret: string, action: RunKind) => Promise<void>;
}) {
  const { t } = useTranslation();
  const kind = secretKind(migration);
  const [run, setRun] = useState<RunKind>(action);
  const [secret, setSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const keyProblem = kind === 'googleKey' && secret.trim() !== '' && !looksLikeGoogleKey(secret);
  const label =
    kind === 'password'
      ? t('migrations.secret.password', 'Password for the login')
      : kind === 'apiKey'
        ? t('migrations.secret.apiKey', 'API key')
        : kind === 'clientSecret'
          ? t('migrations.secret.clientSecret', 'Client secret')
          : t('migrations.secret.googleKey', 'Service account key (JSON)');
  const send = async () => {
    setBusy(true);
    try {
      await onSecret(secret, run);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" onOpenAutoFocus={focusFirstField}>
        <DialogHeader>
          <DialogTitle>{t('migrations.secret.title', 'The source’s secret')}</DialogTitle>
          <DialogDescription>
            {t(
              'migrations.secret.note',
              'The server keeps it in memory for this migration’s runs, never on disk. After a restart it asks again.',
            )}
          </DialogDescription>
        </DialogHeader>
        <Field field="secret" label={label}>
          {kind === 'googleKey' ? (
            <Textarea
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              rows={6}
              className="font-mono text-xs"
              autoComplete="off"
              spellCheck={false}
            />
          ) : (
            <Input
              type="password"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="new-password"
              onKeyDown={(e) => e.key === 'Enter' && secret && void send()}
            />
          )}
        </Field>
        {choose && (
          <Field field="run" label={t('migrations.secret.run', 'Then start')}>
            <Select value={run} onValueChange={(v) => setRun(v as RunKind)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {startable(migration).map((r) => (
                  <SelectItem key={r} value={r}>
                    {runLabel(t, r)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        {kind === 'googleKey' && (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-amber-700 dark:text-amber-400">
              {keyProblem && t('migrations.secret.notAKey', 'That isn’t a service account key file.')}
            </span>
            <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
              <FileUp className="mr-2 h-4 w-4" />
              {t('migrations.secret.readKey', 'Read the key file…')}
            </Button>
            <input
              ref={file}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                e.target.value = '';
                if (picked) void picked.text().then(setSecret);
              }}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void send()} disabled={!secret.trim() || keyProblem || busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('migrations.secret.go', 'Start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProgressBar({ migration }: { migration: Migration }) {
  const { t } = useTranslation();
  const p = migration.progress;
  const done = percent(p);
  return (
    <div className="space-y-1">
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className="h-full bg-primary transition-all" style={{ width: `${done}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {t('migrations.progress', '{{through}} of {{total}} accounts · {{read}} items read, {{written}} written', {
          through: p.finished + p.unfinished,
          total: p.total || migration.accounts.length,
          read: p.read,
          written: p.written,
        })}
      </p>
    </div>
  );
}

function Failures({ migration }: { migration: Migration }) {
  const { t } = useTranslation();
  if (!migration.failures.length) return null;
  return (
    <details className="rounded-lg border text-sm">
      <summary className="cursor-pointer px-3 py-2">
        {t('migrations.failures', {
          count: migration.failures.length,
          defaultValue_one: '{{count}} account that didn’t finish',
          defaultValue_other: '{{count}} accounts that didn’t finish',
        })}
      </summary>
      <ul className="divide-y border-t">
        {migration.failures.map((f) => (
          <li key={f.email} className="grid gap-1 px-3 py-2 sm:grid-cols-[14rem_6rem_1fr]">
            <span className="break-all font-mono text-xs">{f.email}</span>
            <span className="text-muted-foreground">{f.step}</span>
            <span className="break-words">{f.detail}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

type Run = (m: Migration, action: RunKind | 'stop') => void;

function MigrationCard({
  migration,
  onRun,
  onEdit,
  onClose,
  onPasswords,
  onReport,
  onNewSecret,
}: {
  migration: Migration;
  onRun: Run;
  onEdit: () => void;
  onClose: () => void;
  onPasswords: () => void;
  onReport: () => void;
  onNewSecret: () => void;
}) {
  const { t } = useTranslation();
  const can = actions(migration);
  const notes = attention(migration);
  const running = migration.status === 'running';
  const result = resultLabel(t, migration);
  return (
    <section className={`space-y-3 rounded-xl border p-4 ${migration.status === 'closed' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {migration.description || t('migrations.unnamed', 'Migration {{id}}', { id: migration.id })}
            {running && migration.run && (
              <Badge variant="outline">
                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                {t('migrations.b.running', '{{run}} running', { run: runLabel(t, migration.run) })}
              </Badge>
            )}
            {migration.status === 'closed' && <Badge variant="secondary">{t('migrations.b.closed', 'Closed')}</Badge>}
            {migration.moved && migration.status !== 'closed' && (
              <Badge variant="outline">{t('migrations.b.moved', 'Moved')}</Badge>
            )}
          </p>
          <p className="break-all text-sm text-muted-foreground">
            {sourceLine(t, migration)}
            {' · '}
            {t('migrations.accountsCount', {
              count: migration.accounts.length,
              defaultValue_one: '{{count}} account',
              defaultValue_other: '{{count}} accounts',
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {t('migrations.createdBy', 'Added by {{who}}, {{when}}', {
              who: migration.createdBy,
              when: when(migration.createdAt),
            })}
            {!running &&
              migration.run &&
              result &&
              ` · ${t('migrations.lastRun', 'last {{run}} {{result}}, {{when}}', {
                run: runLabel(t, migration.run).toLowerCase(),
                result,
                when: when(migration.finishedAt),
              })}`}
            {migration.diskUsed > 0 &&
              ` · ${t('migrations.diskUsed', '{{size}} of copies on the server', { size: formatSize(migration.diskUsed) })}`}
            {migration.nodeId && ` · ${t('migrations.node', 'on node {{node}}', { node: migration.nodeId })}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can.stop && (
            <Button variant="outline" size="sm" onClick={() => onRun(migration, 'stop')}>
              <Square className="mr-2 h-4 w-4" />
              {t('migrations.stop', 'Stop')}
            </Button>
          )}
          {can.preview && (
            <Button variant="outline" size="sm" onClick={() => onRun(migration, 'preview')}>
              <Eye className="mr-2 h-4 w-4" />
              {t('migrations.preview', 'Preview')}
            </Button>
          )}
          {can.move && (
            <Button
              variant={migration.moved && !resumes(migration) ? 'outline' : 'default'}
              size="sm"
              onClick={() => onRun(migration, 'move')}
            >
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {resumes(migration)
                ? t('migrations.resume', 'Carry on moving')
                : migration.moved
                  ? t('migrations.moveAgain', 'Move again')
                  : t('migrations.move', 'Move')}
            </Button>
          )}
          {can.finalPass && (
            <Button
              variant={resumes(migration) ? 'outline' : 'default'}
              size="sm"
              onClick={() => onRun(migration, 'finalPass')}
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('migrations.finalPass', 'Final pass')}
            </Button>
          )}
          {can.passwords && (
            <Button variant="outline" size="sm" onClick={onPasswords}>
              <KeyRound className="mr-2 h-4 w-4" />
              {t('migrations.passwords', 'New passwords')}
            </Button>
          )}
          {can.report && (
            <Button variant="ghost" size="sm" onClick={onReport}>
              <Download className="mr-2 h-4 w-4" />
              {t('migrations.report', 'Report')}
            </Button>
          )}
          {can.newSecret && (
            <Button variant="ghost" size="sm" onClick={onNewSecret}>
              <KeyRound className="mr-2 h-4 w-4" />
              {t('migrations.newSecret', 'New secret…')}
            </Button>
          )}
          {can.edit && (
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label={t('migrations.edit', 'Change…')}>
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {can.close && (
            <Button variant="ghost" size="sm" onClick={onClose} aria-label={t('migrations.close', 'Close…')}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {running && <ProgressBar migration={migration} />}
      {notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{attentionText(t, a)}</span>
            </li>
          ))}
        </ul>
      )}
      {migration.status !== 'closed' && <Failures migration={migration} />}
    </section>
  );
}

function CloseDialog({
  migration,
  onCancel,
  onClosed,
}: {
  migration: Migration;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const close = async () => {
    setBusy(true);
    try {
      await act(migration.id, 'close');
      onClosed();
    } catch (e) {
      failed(t('migrations.closeFailed', 'Not closed'), e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('migrations.closeTitle', 'Close this migration?')}</DialogTitle>
          <DialogDescription>
            {t(
              'migrations.closeNote',
              'The server deletes its copies of the mailboxes ({{size}}) and forgets the source’s secret. What was moved stays. A closed migration stays listed, and can’t run again.',
              { size: formatSize(migration.diskUsed) },
            )}
          </DialogDescription>
        </DialogHeader>
        {migration.passwordsWaiting && (
          <p className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t(
              'migrations.closePasswords',
              'The new accounts’ passwords haven’t been downloaded. Closing deletes them.',
            )}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void close()} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('migrations.closeGo', 'Close it')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- The guide ----------------------------------------------------------------

const GUIDE_STEPS = ['source', 'accounts', 'target', 'preview', 'move'] as const;

/**
 * The guide: inbuxa-migrate's five steps. The answers are saved on leaving
 * step 3; the preview and the move then run on the saved migration, which
 * the list shows too.
 */
function Guide({
  migrations,
  onRun,
  onDone,
  onSaved,
  onPasswords,
  onReport,
}: {
  migrations: Migration[];
  onRun: Run;
  onDone: () => void;
  onSaved: () => void;
  onPasswords: (m: Migration) => void;
  onReport: (m: Migration) => void;
}) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<MigrationForm>(emptyForm);
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<MigrationForm>) => setForm((f) => ({ ...f, ...patch }));
  const saved = migrations.find((m) => m.id === id) ?? null;
  const problem = formProblem(form);
  const steps = [
    { id: 'source', title: t('migrations.g.source', 'Where the mail is now') },
    { id: 'accounts', title: t('migrations.g.accounts', 'Which accounts') },
    { id: 'target', title: t('migrations.g.target', 'Where to') },
    { id: 'preview', title: t('migrations.g.preview', 'Preview') },
    { id: 'move', title: t('migrations.g.move', 'Move') },
  ];
  const here = GUIDE_STEPS[step];

  const sourceProblem =
    problem === 'imapUrl' || problem === 'imapLogin' || problem === 'jmapUrl' || problem === 'microsoft';
  const accountsProblem = problem === 'noAccounts' || problem === 'badAccounts' || problem === 'tooManyAccounts';
  const canNext =
    here === 'source'
      ? !sourceProblem
      : here === 'accounts'
        ? !accountsProblem
        : here === 'target'
          ? !problem
          : here === 'preview'
            ? saved?.status === 'idle' && saved.run === 'preview' && saved.result === 'done'
            : false;

  const next = async () => {
    if (here !== 'target') return setStep((s) => s + 1);
    setBusy(true);
    try {
      if (saved) await updateMigration(saved.id, toPatch(form, saved));
      else setId(await createMigration(toCreate(form)));
      onSaved();
      setStep((s) => s + 1);
    } catch (e) {
      failed(t('migrations.saveFailed', 'Not saved'), e);
    } finally {
      setBusy(false);
    }
  };

  const runState = (kind: RunKind) => {
    if (!saved) return null;
    const ran = saved.run === kind || (kind === 'move' && saved.run === 'finalPass');
    if (saved.status === 'running' && ran) return <ProgressBar migration={saved} />;
    if (!ran || !saved.result) return null;
    const notes = attention(saved);
    return (
      <div className="space-y-2">
        <p className="text-sm">
          {kind === 'preview'
            ? t(
                'migrations.g.previewed',
                'Preview {{result}}: {{items}} items would move, from {{accounts}} accounts.',
                {
                  result: resultLabel(t, saved),
                  items: saved.progress.read,
                  accounts: saved.progress.finished,
                },
              )
            : t('migrations.g.moved', '{{run}} {{result}}: {{items}} items moved, into {{accounts}} accounts.', {
                run: runLabel(t, saved.run ?? kind),
                result: resultLabel(t, saved),
                items: saved.progress.written,
                accounts: saved.progress.finished,
              })}
        </p>
        {notes.map((a, i) => (
          <p key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="break-words">{attentionText(t, a)}</span>
          </p>
        ))}
        <Failures migration={saved} />
      </div>
    );
  };

  const running = saved?.status === 'running';
  return (
    <WizardShell
      icon="arrow-right-left"
      title={t('migrations.g.title', 'Move mail into this server')}
      subtitle={t('migrations.g.subtitle', 'The server runs inbuxa-migrate for you, account by account.')}
      steps={steps}
      current={step}
      canNext={canNext}
      busy={busy}
      nextLabel={here === 'target' ? t('migrations.g.saveNext', 'Save and go on') : undefined}
      onBack={step > 0 && step < 3 ? () => setStep((s) => s - 1) : undefined}
      onNext={here === 'move' ? undefined : () => void next()}
      onCancel={onDone}
      aside={
        here === 'preview' ? (
          <WizardNote title={t('migrations.g.previewNoteTitle', 'Nothing moves yet')}>
            {t(
              'migrations.g.previewNote',
              'The preview reads every account from the source and counts what would move. It writes nothing here.',
            )}
          </WizardNote>
        ) : here === 'move' ? (
          <WizardNote title={t('migrations.g.moveNoteTitle', 'At cutover')} tone="undo">
            {t(
              'migrations.g.moveNote',
              'Move now, while the old server still takes mail. When you switch the MX records, run the final pass from the list: it brings over what arrived since.',
            )}
          </WizardNote>
        ) : (
          <WizardNote title={t('migrations.g.answersNoteTitle', 'Saved, not run')}>
            {t(
              'migrations.g.answersNote',
              'The answers are saved when you leave “Where to”. The source’s secret is asked for when a run starts.',
            )}
          </WizardNote>
        )
      }
    >
      {here === 'source' && (
        <>
          <SourceFields form={form} set={set} locked={saved?.moved} />
          {sourceProblem && form.url.trim() !== '' && problem && (
            <p className="text-sm text-amber-700 dark:text-amber-400">{problemText(t, problem)}</p>
          )}
        </>
      )}
      {here === 'accounts' && <AccountsField form={form} set={set} />}
      {here === 'target' && <TargetFields form={form} set={set} />}
      {here === 'preview' && saved && (
        <div className="space-y-4">
          <Button onClick={() => onRun(saved, 'preview')} disabled={running}>
            <Eye className="mr-2 h-4 w-4" />
            {saved.run === 'preview' && saved.result
              ? t('migrations.g.previewAgain', 'Preview again')
              : t('migrations.g.runPreview', 'Run the preview')}
          </Button>
          {runState('preview')}
        </div>
      )}
      {here === 'move' && saved && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => onRun(saved, 'move')} disabled={running}>
              <ArrowRightLeft className="mr-2 h-4 w-4" />
              {resumes(saved)
                ? t('migrations.resume', 'Carry on moving')
                : saved.moved
                  ? t('migrations.moveAgain', 'Move again')
                  : t('migrations.g.runMove', 'Move the accounts')}
            </Button>
            {running && (
              <Button variant="outline" onClick={() => onRun(saved, 'stop')}>
                <Square className="mr-2 h-4 w-4" />
                {t('migrations.stop', 'Stop')}
              </Button>
            )}
            {actions(saved).passwords && (
              <Button variant="outline" onClick={() => onPasswords(saved)}>
                <KeyRound className="mr-2 h-4 w-4" />
                {t('migrations.passwords', 'New passwords')}
              </Button>
            )}
            {actions(saved).report && (
              <Button variant="ghost" onClick={() => onReport(saved)}>
                <Download className="mr-2 h-4 w-4" />
                {t('migrations.report', 'Report')}
              </Button>
            )}
          </div>
          {runState('move')}
          {saved.moved && !running && (
            <Button variant="outline" onClick={onDone}>
              {t('migrations.g.done', 'Back to the list')}
            </Button>
          )}
        </div>
      )}
    </WizardShell>
  );
}

// --- The page -----------------------------------------------------------------

type Open =
  | { kind: 'choose' }
  | { kind: 'form'; migration: Migration | null }
  | { kind: 'secret'; migration: Migration; action: RunKind; choose?: boolean }
  | { kind: 'close'; migration: Migration };

export function MigrationsPage() {
  const { t } = useTranslation();
  const canRun = useAccountStore((s) => s.hasPermission('sysMigrationRun'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [open, setOpen] = useState<Open | null>(null);
  const [guided, setGuided] = useState(false);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchMigrations(controller.signal)
      .then((migrations) => !controller.signal.aborted && setLoad({ kind: 'ready', migrations: ordered(migrations) }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof MigrationsUnavailable
              ? t('migrations.unavailable', 'This server doesn’t run migrations. It needs a newer inbuxa.')
              : errorText(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  const migrations = useMemo(() => (load.kind === 'ready' ? load.migrations : []), [load]);
  const anyRunning = migrations.some((m) => m.status === 'running');

  useEffect(() => {
    if (!anyRunning) return;
    const timer = setInterval(refetch, RUNNING_REFRESH_MS);
    return () => clearInterval(timer);
  }, [anyRunning, refetch]);

  /** Starts or stops a run; asks for the secret when the server needs it. */
  const run: Run = (m, action) => {
    act(m.id, action)
      .then(refetch)
      .catch((e: unknown) => {
        if (e instanceof SecretNeeded && action !== 'stop') setOpen({ kind: 'secret', migration: m, action });
        else failed(t('migrations.runFailed', 'Didn’t start'), e);
      });
  };

  const runWithSecret = async (m: Migration, action: RunKind, secret: string) => {
    try {
      await act(m.id, action, secret);
      setOpen(null);
      refetch();
    } catch (e) {
      failed(t('migrations.runFailed', 'Didn’t start'), e);
    }
  };

  const passwords = async (m: Migration) => {
    try {
      const blobId = await takePasswords(m.id);
      await downloadCsv(blobId, fileName(m, 'passwords'), t('migrations.you', 'you'));
      toast({
        title: t('migrations.passwordsTaken', 'Passwords downloaded'),
        description: t(
          'migrations.passwordsTakenNote',
          'The server has deleted its copy. Hand each person theirs, and have them change it.',
        ),
      });
    } catch (e) {
      failed(t('migrations.passwordsFailed', 'No passwords'), e);
    } finally {
      refetch();
    }
  };

  const report = (m: Migration) => {
    if (!m.reportBlobId) return;
    downloadCsv(m.reportBlobId, fileName(m, 'report'), m.createdBy).catch((e: unknown) =>
      failed(t('migrations.reportFailed', 'No report'), e),
    );
  };

  if (guided) {
    return (
      <>
        <Guide
          migrations={migrations}
          onRun={run}
          onDone={() => {
            setGuided(false);
            refetch();
          }}
          onSaved={refetch}
          onPasswords={(m) => void passwords(m)}
          onReport={report}
        />
        {open?.kind === 'secret' && (
          <SecretDialog
            migration={open.migration}
            action={open.action}
            onClose={() => setOpen(null)}
            onSecret={(secret, action) => runWithSecret(open.migration, action, secret)}
          />
        )}
      </>
    );
  }

  const close = () => setOpen(null);
  const current = migrations.filter((m) => m.status !== 'closed');
  const closed = migrations.filter((m) => m.status === 'closed');

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="arrow-right-left"
        title={t('migrations.title', 'Migrations')}
        subtitle={t(
          'migrations.subtitle',
          'Move mailboxes into this server from another one: mail, contacts, calendars and filters, account by account.',
        )}
        actions={
          canRun && (
            <Button onClick={() => setOpen({ kind: 'choose' })}>
              <Plus className="mr-2 h-4 w-4" />
              {t('migrations.new', 'New migration…')}
            </Button>
          )
        }
      />
      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && <p className="text-sm text-destructive">{load.message}</p>}
      {load.kind === 'ready' && migrations.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            'migrations.none',
            'No migrations yet. Start one to bring a domain’s mailboxes over from IMAP, JMAP, Microsoft 365 or Google Workspace.',
          )}
        </p>
      )}
      {current.map((m) => (
        <MigrationCard
          key={m.id}
          migration={m}
          onRun={run}
          onEdit={() => setOpen({ kind: 'form', migration: m })}
          onClose={() => setOpen({ kind: 'close', migration: m })}
          onPasswords={() => void passwords(m)}
          onReport={() => report(m)}
          onNewSecret={() =>
            setOpen({ kind: 'secret', migration: m, action: startable(m)[m.moved ? 1 : 0] ?? 'preview', choose: true })
          }
        />
      ))}
      {closed.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-sm text-muted-foreground">
            {t('migrations.closedList', {
              count: closed.length,
              defaultValue_one: '{{count}} closed migration',
              defaultValue_other: '{{count}} closed migrations',
            })}
          </summary>
          <div className="space-y-3 pt-3">
            {closed.map((m) => (
              <MigrationCard
                key={m.id}
                migration={m}
                onRun={run}
                onEdit={() => undefined}
                onClose={() => undefined}
                onPasswords={() => undefined}
                onReport={() => report(m)}
                onNewSecret={() => undefined}
              />
            ))}
          </div>
        </details>
      )}

      <LaunchChoice
        open={open?.kind === 'choose'}
        onOpenChange={(o) => !o && open?.kind === 'choose' && close()}
        title={t('migrations.new', 'New migration…').replace('…', '')}
        guidedHint={t(
          'migrations.guidedHint',
          'Five steps: where the mail is now, which accounts, where to, a preview, then the move.',
        )}
        manualHint={t('migrations.manualHint', 'Every answer in one form. Preview and move from the list.')}
        onGuided={() => setGuided(true)}
        onManual={() => setOpen({ kind: 'form', migration: null })}
      />
      {open?.kind === 'form' && (
        <FormDialog
          migration={open.migration}
          onClose={close}
          onSaved={() => {
            close();
            refetch();
          }}
        />
      )}
      {open?.kind === 'secret' && (
        <SecretDialog
          migration={open.migration}
          action={open.action}
          choose={open.choose}
          onClose={close}
          onSecret={(secret, action) => runWithSecret(open.migration, action, secret)}
        />
      )}
      {open?.kind === 'close' && (
        <CloseDialog
          migration={open.migration}
          onCancel={close}
          onClosed={() => {
            close();
            refetch();
          }}
        />
      )}
    </div>
  );
}
