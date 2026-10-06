/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Download (scheduled-reports spec, RP-19): the report for a period
 * as a ZIP of a summary and CSVs, mailing nobody. Up to 90 days back, as far
 * as the server keeps its numbers.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { downloadReport, type ScheduledReport } from './api';

type Period = 'last' | '7' | '30' | 'custom';

const DAY = 86_400_000;
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

export function DownloadDialog({ report, onClose }: { report: ScheduledReport; onClose: () => void }) {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('last');
  const today = new Date();
  const [from, setFrom] = useState(isoDay(new Date(today.getTime() - 7 * DAY)));
  const [to, setTo] = useState(isoDay(today));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const earliest = isoDay(new Date(today.getTime() - 89 * DAY));

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      const now = new Date();
      if (period === 'last') await downloadReport(report);
      else if (period === 'custom') {
        // Whole UTC days; a period ending today ends now
        const end = new Date(`${to}T00:00:00Z`).getTime() + DAY;
        await downloadReport(report, new Date(`${from}T00:00:00Z`), new Date(Math.min(end, now.getTime())));
      } else await downloadReport(report, new Date(now.getTime() - Number(period) * DAY), now);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const options: { value: Period; label: string }[] = [
    { value: 'last', label: t('schedRep.dlLast', 'Its last full period') },
    { value: '7', label: t('schedRep.dl7', 'The last 7 days') },
    { value: '30', label: t('schedRep.dl30', 'The last 30 days') },
    { value: 'custom', label: t('schedRep.dlCustom', 'Pick dates') },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('schedRep.dlTitle', 'Download {{name}}', { name: report.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'schedRep.dlHint',
              'A ZIP with the summary and a CSV for each section that has rows. Nobody is mailed. Up to 90 days back.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup">
          {options.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="period"
                value={o.value}
                checked={period === o.value}
                onChange={() => setPeriod(o.value)}
              />
              {o.label}
            </label>
          ))}
          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-3 pl-6">
              <div className="space-y-1">
                <Label htmlFor="dl-from">{t('schedRep.dlFrom', 'From')}</Label>
                <Input
                  id="dl-from"
                  type="date"
                  min={earliest}
                  max={to}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="dl-to">{t('schedRep.dlTo', 'To')}</Label>
                <Input
                  id="dl-to"
                  type="date"
                  min={from}
                  max={isoDay(today)}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button type="button" disabled={busy} onClick={() => void go()}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Download className="mr-1.5 h-4 w-4" />}
            {t('schedRep.dlGo', 'Download ZIP')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
