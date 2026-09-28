/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: how long rotated log files are kept (personal-data catalog spec,
 * D1), on Settings › Security › Hardening. Log files carry client IP
 * addresses and email addresses; without a limit they are never deleted.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileClock, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { fetchLogSettings, updateLogSettings, validDays, type KeepForDays } from './logSettings';

export function LogRetentionCard() {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasPermission('sysTracerGet'));
  const canUpdate = useAccountStore((s) => s.hasPermission('sysTracerUpdate'));
  const [keep, setKeep] = useState<KeepForDays | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('30');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    fetchLogSettings(controller.signal)
      .then((days) => !controller.signal.aborted && setKeep(days))
      // An older server has no such setting: show nothing
      .catch(() => {});
    return () => controller.abort();
  }, [canGet]);

  if (keep === undefined) return null;

  const save = async (days: KeepForDays) => {
    setBusy(true);
    try {
      await updateLogSettings(days);
      setKeep(days);
      setEditing(false);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('logRetention.failed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <FileClock className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">{t('logRetention.title', 'Log files')}</p>
          <p className="text-sm text-muted-foreground">
            {keep === null
              ? t(
                  'logRetention.forever',
                  'Rotated log files are kept with no limit. They record client IP addresses and email addresses.',
                )
              : t('logRetention.days', {
                  count: keep,
                  defaultValue_one: 'Rotated log files are deleted after 1 day, on every server.',
                  defaultValue_other: 'Rotated log files are deleted after {{count}} days, on every server.',
                })}
          </p>
        </div>
      </div>
      {canUpdate && !editing && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setValue(String(keep ?? 30));
              setEditing(true);
            }}
          >
            {t('logRetention.change', 'Change…')}
          </Button>
          {keep !== null && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save(null)}>
              {t('logRetention.keepAll', 'Keep every file')}
            </Button>
          )}
        </div>
      )}
      {canUpdate && editing && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (validDays(value)) void save(Number(value));
          }}
        >
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">{t('logRetention.daysLabel', 'Delete after (days)')}</span>
            <Input type="number" min={1} value={value} onChange={(e) => setValue(e.target.value)} className="w-32" />
          </label>
          <Button type="submit" size="sm" disabled={busy || !validDays(value)}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('logRetention.save', 'Save')}
          </Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setEditing(false)}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </form>
      )}
    </section>
  );
}
