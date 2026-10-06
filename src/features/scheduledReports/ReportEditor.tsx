/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: making or changing a scheduled report (scheduled-reports spec):
 * name, sections with what each holds, when it goes in which time zone, who
 * gets it (accounts on this server; the digest's are the administrators),
 * and CSV files.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox } from '@/components/ui/combobox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuthStore } from '@/stores/authStore';
import { createReport, updateReport, type Frequency, type ReportInput, type ScheduledReport } from './api';
import { browserTimeZone, newReport, parseRecipients, SECTIONS, SERVER_WIDE, timeZones } from './describe';
import { useSectionLabels } from './sections';

export function ReportEditor({
  report,
  tenant,
  onClose,
}: {
  report: ScheduledReport | null;
  /** A tenant administrator's report leaves out the server-wide sections. */
  tenant: boolean;
  onClose: (saved: boolean) => void;
}) {
  const { t, i18n } = useTranslation();
  const labels = useSectionLabels();
  const me = useAuthStore((s) => s.username);
  const [input, setInput] = useState<ReportInput>(() =>
    report
      ? {
          name: report.name,
          sections: report.sections,
          schedule: report.schedule,
          recipients: report.recipients,
          attachCsv: report.attachCsv,
        }
      : newReport(me && me.includes('@') ? me : null, browserTimeZone()),
  );
  const [recipientText, setRecipientText] = useState(input.recipients.join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const builtIn = report?.builtIn ?? false;
  const s = input.schedule;
  const zones = useMemo(
    () => timeZones(s.timeZone).map((z) => ({ value: z, label: z.replace(/_/g, ' ') })),
    [s.timeZone],
  );
  const weekdays = useMemo(
    () =>
      [1, 2, 3, 4, 5, 6, 7].map((d) => ({
        value: String(d),
        label: new Date(Date.UTC(2026, 9, 4 + d)).toLocaleDateString(i18n.language, {
          weekday: 'long',
          timeZone: 'UTC',
        }),
      })),
    [i18n.language],
  );
  const setSchedule = (patch: Partial<ReportInput['schedule']>) =>
    setInput((i) => ({ ...i, schedule: { ...i.schedule, ...patch } }));
  const toggleSection = (name: (typeof SECTIONS)[number], on: boolean) =>
    setInput((i) => ({
      ...i,
      sections: SECTIONS.filter((x) => (x === name ? on : i.sections.includes(x))),
    }));

  const save = async () => {
    setSaving(true);
    setError(null);
    const body: ReportInput = {
      ...input,
      name: input.name.trim(),
      sections: tenant ? input.sections.filter((x) => !SERVER_WIDE.has(x)) : input.sections,
      recipients: builtIn ? [] : parseRecipients(recipientText),
    };
    try {
      if (report) {
        const { recipients, ...rest } = body;
        await updateReport(report.id, builtIn ? rest : { ...rest, recipients });
      } else {
        await createReport(body);
      }
      onClose(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose(false)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {report
              ? t('schedRep.editTitle', 'Edit {{name}}', { name: report.name })
              : t('schedRep.newTitle', 'New report')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'schedRep.editHint',
              'Built when it’s due, from what the server already keeps. Empty sections are left out.',
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="space-y-1">
            <Label htmlFor="rep-name">{t('schedRep.name', 'Name')}</Label>
            <Input
              id="rep-name"
              value={input.name}
              maxLength={100}
              placeholder={t('schedRep.namePlaceholder', 'e.g. Monday morning summary')}
              onChange={(e) => setInput((i) => ({ ...i, name: e.target.value }))}
            />
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('schedRep.sections', 'What it covers')}</legend>
            {SECTIONS.map((name) => {
              const off = tenant && SERVER_WIDE.has(name);
              return (
                <label key={name} className={`flex gap-3 rounded-md border p-2 ${off ? 'opacity-60' : ''}`}>
                  <Checkbox
                    className="mt-0.5"
                    checked={!off && input.sections.includes(name)}
                    disabled={off}
                    onCheckedChange={(v) => toggleSection(name, v === true)}
                  />
                  <span className="text-sm">
                    <span className="font-medium">{labels[name].label}</span>
                    <span className="block text-muted-foreground">
                      {off ? t('schedRep.serverWide', 'Server-wide, so not in a tenant’s report.') : labels[name].hint}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('schedRep.when', 'When')}</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1">
                <Label>{t('schedRep.frequency', 'How often')}</Label>
                <Select value={s.frequency} onValueChange={(v) => setSchedule({ frequency: v as Frequency })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">{t('schedRep.freqDaily', 'Every day')}</SelectItem>
                    <SelectItem value="weekly">{t('schedRep.freqWeekly', 'Every week')}</SelectItem>
                    <SelectItem value="monthly">{t('schedRep.freqMonthly', 'Every month')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {s.frequency === 'weekly' && (
                <div className="space-y-1">
                  <Label>{t('schedRep.weekday', 'On')}</Label>
                  <Select value={String(s.weekday)} onValueChange={(v) => setSchedule({ weekday: Number(v) })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {weekdays.map((d) => (
                        <SelectItem key={d.value} value={d.value}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {s.frequency === 'monthly' && (
                <div className="space-y-1">
                  <Label htmlFor="rep-dom">{t('schedRep.dayOfMonth', 'On day (1–28)')}</Label>
                  <Input
                    id="rep-dom"
                    type="number"
                    min={1}
                    max={28}
                    value={s.dayOfMonth}
                    onChange={(e) =>
                      setSchedule({ dayOfMonth: Math.min(28, Math.max(1, Number(e.target.value) || 1)) })
                    }
                  />
                </div>
              )}
              <div className="space-y-1">
                <Label htmlFor="rep-time">{t('schedRep.time', 'At')}</Label>
                <Input
                  id="rep-time"
                  type="time"
                  value={`${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [h, m] = e.target.value.split(':').map(Number);
                    if (!Number.isNaN(h) && !Number.isNaN(m)) setSchedule({ hour: h, minute: m });
                  }}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>{t('schedRep.timeZone', 'Time zone')}</Label>
              <Combobox
                options={zones}
                value={s.timeZone}
                onValueChange={(v) => v && setSchedule({ timeZone: v })}
                searchPlaceholder={t('schedRep.zoneSearch', 'Search time zones…')}
              />
            </div>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="rep-to">{t('schedRep.recipients', 'Who gets it')}</Label>
            {builtIn ? (
              <p className="text-sm text-muted-foreground">
                {t('schedRep.digestRecipients', 'The system administrators, kept up to date as they change.')}
              </p>
            ) : (
              <>
                <Textarea
                  id="rep-to"
                  rows={3}
                  value={recipientText}
                  placeholder="ops@example.org"
                  onChange={(e) => setRecipientText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {t(
                    'schedRep.recipientsHint',
                    'One address per line, up to 50. Accounts on this server only: reports never leave it.',
                  )}
                </p>
              </>
            )}
          </div>

          <label className="flex items-center justify-between gap-3 text-sm">
            <span>
              <span className="font-medium">{t('schedRep.attachCsv', 'Attach CSV files')}</span>
              <span className="block text-muted-foreground">
                {t('schedRep.attachCsvHint', 'The detail behind each section, for a spreadsheet.')}
              </span>
            </span>
            <Switch checked={input.attachCsv} onCheckedChange={(v) => setInput((i) => ({ ...i, attachCsv: v }))} />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onClose(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={saving || !input.name.trim()} onClick={() => void save()}>
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {report ? t('schedRep.save', 'Save') : t('schedRep.create', 'Create report')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
