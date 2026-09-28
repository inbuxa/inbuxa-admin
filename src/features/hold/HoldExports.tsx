/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: exporting what a legal hold keeps (audit-hold-lock spec, LH-12).
 * The export runs on the server; this starts one, lists them, and downloads
 * a ready file for whoever started it.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileArchive, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { formatSize, type LegalHold } from './legalHold';
import { downloadExport, exportFileName, startExport, type HoldExport } from './holdExport';

function AccountChip({ id, onRemove }: { id: string; onRemove?: () => void }) {
  const schema = useSchemaStore((s) => s.schema);
  const { label } = useObjectLabel('x:Account', id, schema!);
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

export function ExportDialog({
  hold,
  onClose,
  onStarted,
}: {
  hold: LegalHold;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      await startExport(hold.id, accounts, reason);
      toast({ title: t('hold.export.started', 'Export started') });
      onStarted();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('hold.export.notStarted', 'The export didn’t start'),
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
          <DialogTitle>{t('hold.export.title', 'Export {{name}}', { name: hold.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'hold.export.body',
              'Collects everything this hold covers into one ZIP: mail as .eml, calendars as .ics, contacts as .vcf, files as they are, and the deleted items it keeps, with a manifest of SHA-256 checksums. It runs on the server; you can leave this page.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1 text-sm">
          <div className="text-muted-foreground">
            {t('hold.export.accounts', 'People (leave empty for everyone the hold covers)')}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {accounts.map((id) => (
              <AccountChip key={id} id={id} onRemove={() => setAccounts(accounts.filter((x) => x !== id))} />
            ))}
            {schema && (
              <ObjectPicker
                schema={schema}
                objectName="x:Account/User"
                value=""
                onChange={(id) => {
                  if (id && !accounts.includes(id)) setAccounts([...accounts, id]);
                }}
                placeholder={t('hold.addAccount', 'Add a person')}
              />
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('hold.export.accountsHint', 'Someone the hold doesn’t cover is left out of the file.')}
          </p>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('hold.reason', 'Reason')}</span>
          <Textarea
            value={reason}
            maxLength={500}
            placeholder={t('hold.export.reasonHint', 'Why, for the audit log: a production request, a matter number…')}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('hold.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void run()} disabled={busy || !reason.trim()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileArchive className="mr-2 h-4 w-4" />}
            {t('hold.export.go', 'Start the export')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ExportRow({ hold, exp }: { hold: LegalHold; exp: HoldExport }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      await downloadExport(exp, exportFileName(hold.name, exp));
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('hold.export.downloadFailed', 'Couldn’t download the export'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-wrap items-start justify-between gap-2 border-t pt-2 text-sm first:border-t-0 first:pt-0">
      <div className="min-w-0 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2">
          {exp.status === 'running' && (
            <Badge variant="outline">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              {t('hold.export.running', 'Collecting')}
            </Badge>
          )}
          {exp.status === 'ready' && <Badge variant="secondary">{t('hold.export.ready', 'Ready')}</Badge>}
          {exp.status === 'failed' && <Badge variant="destructive">{t('hold.export.failed', 'Failed')}</Badge>}
          <span className="text-muted-foreground">
            {t('hold.export.startedBy', '{{when}} by {{who}}', {
              when: new Date(exp.createdAt).toLocaleString(),
              who: exp.createdBy,
            })}
          </span>
        </div>
        <div className="text-muted-foreground">{exp.reason}</div>
        {exp.accountIds.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {exp.accountIds.map((id) => (
              <AccountChip key={id} id={id} />
            ))}
          </div>
        )}
        {exp.status === 'ready' && (
          <div className="text-muted-foreground">
            {[
              exp.items === 1
                ? t('hold.export.oneItem', '1 item')
                : t('hold.export.items', '{{n}} items', { n: String(exp.items) }),
              formatSize(exp.size),
            ].join(' · ')}
            {exp.sha256 && <div className="break-all font-mono text-xs">SHA-256 {exp.sha256}</div>}
          </div>
        )}
        {exp.status === 'failed' && exp.error && <div className="text-destructive">{exp.error}</div>}
      </div>
      {exp.status === 'ready' && (
        <Button variant="outline" size="sm" onClick={() => void download()} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {t('hold.export.download', 'Download')}
        </Button>
      )}
    </div>
  );
}

/** A hold's exports, newest first. */
export function ExportList({ hold, exports }: { hold: LegalHold; exports: HoldExport[] }) {
  const { t } = useTranslation();
  if (!exports.length) return null;
  return (
    <div className="space-y-2 rounded-lg bg-muted/40 p-3">
      <div className="text-sm text-muted-foreground">{t('hold.export.heading', 'Exports')}</div>
      {exports.map((exp) => (
        <ExportRow key={exp.id} hold={hold} exp={exp} />
      ))}
      <p className="text-xs text-muted-foreground">
        {t(
          'hold.export.expiry',
          'Only the person who started an export can download it. The file is kept as a temporary upload (an hour, unless the upload time-to-live says otherwise); the record, with its checksum, stays.',
        )}
      </p>
    </div>
  );
}
