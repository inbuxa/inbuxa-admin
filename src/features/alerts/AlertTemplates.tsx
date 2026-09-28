/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: above Monitoring › Alerts, every alert as a sentence and a set of
 * templates: pick one, say who to email, done (settings-reorg, second wave).
 * No expression to write.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getAccountId, jmapRequest, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import type { JmapSetResponse } from '@/types/jmap';
import { cn } from '@/lib/utils';
import {
  describeAlert,
  recognize,
  templateCondition,
  TEMPLATES,
  type AlertRecord,
  type AlertTemplate,
} from './templates';

async function load(): Promise<{ alerts: AlertRecord[]; defaultDomain: string }> {
  const res = await jmapRequest([
    ['x:Alert/get', { accountId: getAccountId('x:Alert'), ids: null }, 'a'],
    [
      'x:SystemSettings/get',
      { accountId: getAccountId('x:SystemSettings'), ids: ['singleton'], properties: ['defaultDomainId'] },
      's',
    ],
    ['x:Domain/get', { accountId: getAccountId('x:Domain'), ids: null, properties: ['name'] }, 'd'],
  ]);
  const list = (id: string) =>
    (res.find(([, , i]) => i === id)?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? [];
  const defaultId = list('s')[0]?.defaultDomainId;
  return {
    alerts: list('a') as AlertRecord[],
    defaultDomain: String(list('d').find((d) => d.id === defaultId)?.name ?? ''),
  };
}

export function AlertTemplates({ onCreated }: { onCreated?: () => void }) {
  const { t } = useTranslation();
  const me = useAuthStore((s) => s.username) ?? '';
  const canCreate = useAccountStore((s) => s.hasObjectPermission('sysAlert', 'Create'));
  const [data, setData] = useState<{ alerts: AlertRecord[]; defaultDomain: string } | null>(null);
  const [open, setOpen] = useState<AlertTemplate | null>(null);
  const [threshold, setThreshold] = useState('');
  const [to, setTo] = useState('');
  const [from, setFrom] = useState('');
  const [event, setEvent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => load().then(setData), []);
  useEffect(() => {
    let live = true;
    load()
      .then((d) => live && setData(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!data) return null;

  const inUse = new Set(
    data.alerts
      .map((a) => (Object.keys(a.condition?.match ?? {}).length === 0 ? recognize(a.condition?.else ?? '') : null))
      .filter(Boolean)
      .map((r) => r!.template.id),
  );

  const start = (tpl: AlertTemplate) => {
    setOpen(tpl);
    setThreshold(String(tpl.threshold?.value ?? ''));
    setTo(me.includes('@') ? me : '');
    setFrom(data.defaultDomain ? `postmaster@${data.defaultDomain}` : '');
    setEvent(false);
    setError(null);
  };

  const recipients = to
    .split(/[\s,]+/)
    .map((a) => a.trim())
    .filter(Boolean);
  const emailOk = (a: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a);
  const n = Number(threshold);
  const valid =
    open !== null &&
    (!open.threshold || (Number.isInteger(n) && n > 0)) &&
    recipients.length > 0 &&
    recipients.every(emailOk) &&
    emailOk(from);

  const create = async () => {
    if (!open) return;
    setBusy(true);
    setError(null);
    try {
      const [res] = await jmapSet('x:Alert', getAccountId('x:Alert'), {
        create: {
          alert: {
            enable: true,
            condition: { match: {}, else: templateCondition(open, open.threshold ? n : 0) },
            emailAlert: {
              '@type': 'Enabled',
              fromName: 'Mail server alerts',
              fromAddress: from.trim(),
              to: Object.fromEntries(recipients.map((r) => [r, true])),
              subject: open.subject,
              body: open.body,
            },
            eventAlert: event ? { '@type': 'Enabled', eventMessage: open.subject } : { '@type': 'Disabled' },
          },
        },
      });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const bad = body?.notCreated?.alert;
      if (bad || !body?.created?.alert) {
        throw new Error(bad?.description ?? bad?.type ?? t('alertTemplates.failed', 'The alert could not be added.'));
      }
      setOpen(null);
      await reload();
      onCreated?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <BellRing className="h-5 w-5 shrink-0 text-primary" />
        <p className="font-medium">
          {data.alerts.length === 0
            ? t('alertTemplates.none', 'No alerts yet: nothing tells you when something goes wrong.')
            : t('alertTemplates.title', 'In plain words')}
        </p>
      </div>
      {data.alerts.length > 0 && (
        <ul className="space-y-1 text-sm">
          {data.alerts.map((a) => (
            <li key={a.id} className={a.enable === false ? 'text-muted-foreground' : undefined}>
              {describeAlert(a)}
            </li>
          ))}
        </ul>
      )}

      {canCreate && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('alertTemplates.add', 'Add one from a template')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.id}
                type="button"
                onClick={() => start(tpl)}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/60',
                  inUse.has(tpl.id) ? 'bg-muted/40' : 'bg-background',
                )}
              >
                <span className="flex w-full items-center gap-2 text-sm font-medium">
                  {tpl.title}
                  {inUse.has(tpl.id) && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {t('alertTemplates.inUse', 'In use')}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('alertTemplates.when', 'When {{when}}.', { when: tpl.when(tpl.threshold?.value ?? 0) })}
                </span>
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              'alertTemplates.howOften',
              'Alerts are checked every minute and email once when their condition turns true. The queue and memory alerts can fire again after things recover; the others fire the first time, and again only after a restart.',
            )}
          </p>
        </div>
      )}

      <Dialog open={open !== null} onOpenChange={(v) => !v && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>
              {open &&
                t('alertTemplates.whenLong', 'Email when {{when}}.', {
                  when: open.when(open.threshold && Number.isInteger(n) && n > 0 ? n : (open.threshold?.value ?? 0)),
                })}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {open?.threshold && (
              <div className="space-y-1.5">
                <Label htmlFor="alert-threshold">{open.threshold.label}</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="alert-threshold"
                    type="number"
                    min={1}
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                    className="w-32"
                  />
                  <span className="text-sm text-muted-foreground">{open.threshold.unit}</span>
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="alert-to">{t('alertTemplates.to', 'Email')}</Label>
              <Input id="alert-to" value={to} onChange={(e) => setTo(e.target.value)} placeholder="ops@example.org" />
              <p className="text-xs text-muted-foreground">
                {t(
                  'alertTemplates.toHint',
                  'One or more addresses, separated by commas. Preferably one not hosted on this server.',
                )}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-from">{t('alertTemplates.from', 'From')}</Label>
              <Input id="alert-from" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={event} onCheckedChange={(v) => setEvent(Boolean(v))} />
              {t('alertTemplates.event', 'Also raise an event, for webhooks')}
            </label>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
              <Button type="button" onClick={() => void create()} disabled={!valid || busy}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('alertTemplates.create', 'Add alert')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
