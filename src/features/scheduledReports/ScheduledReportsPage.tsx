/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Reports › Scheduled (scheduled-reports spec). Each report with its
 * schedule in words, who gets it, what it covers, when it goes next and how
 * the last run went; Send now, Download and Undo-able Delete. The weekly
 * digest comes first. Server administrators also set who reports come from.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, Download, Loader2, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { toast } from '@/hooks/use-toast';
import { useAccountStore } from '@/stores/accountStore';
import { isPendingDelete, scheduleDelete, UNDO_MS, usePendingDeletes } from '@/lib/pendingDeletes';
import { cn } from '@/lib/utils';
import {
  destroyReports,
  fetchReports,
  fetchSettings,
  ScheduledReportsUnavailable,
  updateReport,
  updateSettings,
  type ReportSettings,
  type ScheduledReport,
} from './api';
import { isFailing, scheduleText } from './describe';
import { useSectionLabels } from './sections';
import { ReportEditor } from './ReportEditor';
import { DownloadDialog } from './DownloadDialog';

const OBJECT = 'inbuxa:ScheduledReport';

function when(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function ReportCard({
  report,
  canUpdate,
  onEdit,
  onDownload,
  onChanged,
  onDelete,
}: {
  report: ScheduledReport;
  canUpdate: boolean;
  onEdit: () => void;
  onDownload: () => void;
  onChanged: () => void;
  onDelete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const labels = useSectionLabels();
  const [busy, setBusy] = useState(false);
  const last = report.runs[0];
  const failing = isFailing(report);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await updateReport(report.id, { enabled });
      onChanged();
    } catch (e) {
      toast({ variant: 'destructive', title: t('schedRep.notSaved', 'Not saved'), description: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const sendNow = async () => {
    setBusy(true);
    try {
      await updateReport(report.id, { sendNow: true });
      toast({
        title: t('schedRep.sending', 'Sending {{name}}', { name: report.name }),
        description: t('schedRep.sendingHint', 'It shows under Last run in a moment.'),
      });
      setTimeout(onChanged, 3000);
    } catch (e) {
      toast({ variant: 'destructive', title: t('schedRep.notSent', 'Not sent'), description: String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={cn('space-y-3 rounded-xl border bg-card p-4 shadow-soft', !report.enabled && 'opacity-80')}>
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-medium">{report.name}</h2>
            {report.builtIn && (
              <span className="rounded-full border px-2 py-0.5 text-xs text-muted-foreground">
                {t('schedRep.builtIn', 'Built in')}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{scheduleText(report.schedule, t, i18n.language)}</p>
          <p className="text-sm text-muted-foreground">
            {report.builtIn
              ? t('schedRep.toAdmins', 'To the system administrators')
              : t('schedRep.to', 'To {{who}}', {
                  who:
                    report.recipients.slice(0, 3).join(', ') +
                    (report.recipients.length > 3 ? ` +${report.recipients.length - 3}` : ''),
                })}
            {report.attachCsv && ` · ${t('schedRep.withCsv', 'with CSV files')}`}
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={report.enabled}
            disabled={!canUpdate || busy}
            onCheckedChange={(v) => void toggle(v)}
            aria-label={t('schedRep.enabled', 'Send {{name}}', { name: report.name })}
          />
          {report.enabled ? t('schedRep.on', 'On') : t('schedRep.off', 'Off')}
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {report.sections.map((s) => (
          <span key={s} className="rounded-md bg-muted px-2 py-0.5 text-xs">
            {labels[s].label}
          </span>
        ))}
      </div>

      {failing && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          {t('schedRep.failing', 'The last two runs failed: {{reason}}', { reason: last?.reason ?? '' })}
        </p>
      )}

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">{t('schedRep.next', 'Next')}</dt>
          <dd>{report.enabled ? when(report.nextRunAt) : t('schedRep.notScheduled', 'Off, so not scheduled')}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">{t('schedRep.last', 'Last run')}</dt>
          <dd>
            {!last
              ? t('schedRep.never', 'Not yet')
              : last.status === 'sent'
                ? t('schedRep.lastSent', '{{when}}, to {{count}}', {
                    when: when(last.at),
                    count: last.recipients,
                  }) + (last.byHand ? ` ${t('schedRep.byHand', '(sent by hand)')}` : '')
                : t('schedRep.lastFailed', '{{when}}, failed: {{reason}}', {
                    when: when(last.at),
                    reason: last.reason ?? '',
                  })}
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-2">
        {canUpdate && (
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="mr-1.5 h-4 w-4" />
            {t('schedRep.edit', 'Edit')}
          </Button>
        )}
        {canUpdate && (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void sendNow()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Send className="mr-1.5 h-4 w-4" />}
            {t('schedRep.sendNow', 'Send now')}
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onDownload}>
          <Download className="mr-1.5 h-4 w-4" />
          {t('schedRep.download', 'Download')}
        </Button>
        {canUpdate && !report.builtIn && (
          <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={onDelete}>
            <Trash2 className="mr-1.5 h-4 w-4" />
            {t('schedRep.delete', 'Delete')}
          </Button>
        )}
      </div>
    </article>
  );
}

function SenderSettings({ settings, onSaved }: { settings: ReportSettings; onSaved: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(settings.fromName);
  const [address, setAddress] = useState(settings.fromAddress);
  const [saving, setSaving] = useState(false);
  const changed = name !== settings.fromName || address !== settings.fromAddress;
  const save = async () => {
    setSaving(true);
    try {
      await updateSettings({ fromName: name, fromAddress: address });
      toast({ title: t('schedRep.senderSaved', 'Saved'), variant: 'success' });
      onSaved();
    } catch (e) {
      toast({ variant: 'destructive', title: t('schedRep.notSaved', 'Not saved'), description: String(e) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4 shadow-soft">
      <div>
        <h2 className="font-medium">{t('schedRep.senderTitle', 'Who reports come from')}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'schedRep.senderHint',
            'Reports are DKIM-signed with this address’s domain. A domain without a DKIM key can’t send them.',
          )}
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="rep-from-name">{t('schedRep.fromName', 'Name')}</Label>
          <Input id="rep-from-name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="rep-from-address">{t('schedRep.fromAddress', 'Address')}</Label>
          <Input id="rep-from-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
      </div>
      <Button type="button" size="sm" disabled={!changed || saving} onClick={() => void save()}>
        {t('schedRep.save', 'Save')}
      </Button>
    </section>
  );
}

function removeWithUndo(report: ScheduledReport, t: TFunction) {
  const scheduled = scheduleDelete(OBJECT, [report.id], async (_object, ids) => {
    const { destroyed, errors } = await destroyReports(ids);
    return {
      destroyed,
      errors: Object.fromEntries(
        Object.entries(errors).map(([id, description]) => [id, { type: 'refused', description }]),
      ),
    };
  });
  const { dismiss } = toast({
    title: t('undoDelete.deleted', 'Deleted {{what}}', { what: report.name }),
    duration: UNDO_MS,
    description: (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={() => {
          scheduled.undo();
          dismiss();
        }}
      >
        {t('undoDelete.undo', 'Undo')}
      </Button>
    ),
  });
  void scheduled.settled.then((result) => {
    const why = result && Object.values(result.errors)[0]?.description;
    if (why) toast({ variant: 'destructive', title: t('schedRep.notDeleted', 'Not deleted'), description: why });
  });
}

export function ScheduledReportsPage() {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasPermission('sysScheduledReportUpdate'));
  const [reports, setReports] = useState<ScheduledReport[] | null>(null);
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [editing, setEditing] = useState<ScheduledReport | 'new' | null>(null);
  const [downloading, setDownloading] = useState<ScheduledReport | null>(null);
  const pendingVersion = usePendingDeletes((s) => s.versions[OBJECT] ?? 0);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([fetchReports(), fetchSettings()]);
      setReports(list);
      setSettings(s);
      setError(null);
    } catch (e) {
      if (e instanceof ScheduledReportsUnavailable) setUnavailable(true);
      else setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load, pendingVersion]);

  const shown = useMemo(() => (reports ?? []).filter((r) => !isPendingDelete(OBJECT, r.id)), [reports, pendingVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  // Only server administrators see the digest, so it marks who may set the sender
  const serverLevel = (reports ?? []).some((r) => r.builtIn);

  if (unavailable) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        {t('schedRep.unavailable', 'This server doesn’t have scheduled reports yet. They come with a server update.')}
      </p>
    );
  }
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!reports || !settings) return <LoadingFallback />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          icon="calendar-clock"
          title={t('schedRep.title', 'Scheduled reports')}
          subtitle={t(
            'schedRep.subtitle',
            'Reports the server builds from what it already keeps, and mails to accounts here. The weekly digest is built in.',
          )}
        />
        {canUpdate && (
          <Button type="button" onClick={() => setEditing('new')}>
            <Plus className="mr-2 h-4 w-4" />
            {t('schedRep.new', 'New report')}
          </Button>
        )}
      </div>

      <div className="space-y-3">
        {shown.map((report) => (
          <ReportCard
            key={report.id}
            report={report}
            canUpdate={canUpdate}
            onEdit={() => setEditing(report)}
            onDownload={() => setDownloading(report)}
            onChanged={() => void load()}
            onDelete={() => removeWithUndo(report, t)}
          />
        ))}
        {shown.length === 0 && (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('schedRep.none', 'No reports yet. Make one for your own tenant’s domains and people.')}
          </p>
        )}
      </div>

      {serverLevel && canUpdate && <SenderSettings settings={settings} onSaved={() => void load()} />}

      {editing && (
        <ReportEditor
          report={editing === 'new' ? null : editing}
          tenant={!serverLevel}
          onClose={(saved) => {
            setEditing(null);
            if (saved) void load();
          }}
        />
      )}
      {downloading && <DownloadDialog report={downloading} onClose={() => setDownloading(null)} />}
    </div>
  );
}
