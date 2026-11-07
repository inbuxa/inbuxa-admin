/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: above the Certificates list, every certificate the server orders
 * by itself (#167): which domain renews it, when, why the last order failed,
 * and Order again.
 */

import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Clock, Loader2, Plus, RotateCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAccountId, jmapSet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import { cn } from '@/lib/utils';
import { orderNames } from './names';
import { canOrderAgain, orderAgainSet, renewalState, type RenewalState } from './orders';
import { coveringCert, fmtDate, type CertRow, type Loaded, load, pollOrders, refusal } from './shared';
import { ORDER_WIZARD_VIEW } from './CertificateSetupCard';

interface State {
  data: Loaded;
  certs: CertRow[];
  tasks: Record<string, unknown>[];
  /** False when renewal tasks can't be read (no permission): then nothing is known about them. */
  tasksKnown: boolean;
  /** When this was read, for telling a renewal due soon from one due later. */
  at: number;
}

export function CertificateOrdersPanel({ className }: { className?: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const section = viewToSection['x:Certificate'] ?? 'Settings';
  const domainSection = viewToSection['x:Domain'] ?? 'Management';
  const [state, setState] = useState<State | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [following, setFollowing] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await load();
      // Tasks need their own permission; without it the panel still lists the orders.
      const orders = await pollOrders().catch(() => null);
      setState({
        data,
        certs: orders?.certs ?? data.certs,
        tasks: orders?.tasks ?? [],
        tasksKnown: orders !== null,
        at: Date.now(),
      });
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  /** After Order again, reads again every few seconds for a minute, so the outcome shows. */
  const follow = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    const began = Date.now();
    setFollowing(true);
    timer.current = setInterval(() => {
      if (Date.now() - began > 60_000) {
        clearInterval(timer.current!);
        timer.current = null;
        setFollowing(false);
        return;
      }
      void refresh();
    }, 5000);
  }, [refresh]);

  const orderAgain = async (domainId: string, taskId: string | undefined) => {
    setBusy(domainId);
    setErrors((e) => ({ ...e, [domainId]: '' }));
    try {
      const [res] = await jmapSet('x:Task', getAccountId('x:Task'), orderAgainSet(domainId, taskId));
      const why = refusal(res?.[1], 'The order could not be started.');
      if (why) throw new Error(why);
      await refresh();
      follow();
    } catch (e) {
      setErrors((s) => ({ ...s, [domainId]: e instanceof Error ? e.message : String(e) }));
    } finally {
      setBusy(null);
    }
  };

  // Nothing to show when the server can't be read; the list below says why.
  if (failed) return null;

  const orderButton = (
    <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/${section}/${ORDER_WIZARD_VIEW}`)}>
      <Plus className="h-4 w-4" />
      {t('certOrders.order', 'Order a certificate')}
    </Button>
  );

  if (!state) {
    return (
      <div className={cn('flex items-center gap-2 rounded-xl border p-4 text-sm text-muted-foreground', className)}>
        <Loader2 className="h-4 w-4 animate-spin" />
        {t('certOrders.loading', 'Reading automatic certificates…')}
      </div>
    );
  }

  const automatic = state.data.domains.filter((d) => d.automatic);

  return (
    <div className={cn('space-y-3 rounded-xl border p-4', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('certOrders.title', 'Ordered automatically')}</p>
          <p className="text-sm text-muted-foreground">
            {automatic.length === 0
              ? t('certOrders.none', 'No certificate is ordered automatically yet.')
              : t(
                  'certOrders.hint',
                  'Each one belongs to a domain, which renews it before it expires. Connections that ask for one of its names get it.',
                )}
          </p>
        </div>
        {following && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-hidden />}
        {orderButton}
      </div>
      {automatic.length > 0 && (
        <ul className="divide-y rounded-lg border text-sm">
          {automatic.map((d) => {
            const method = d.dnsAutomatic ? 'dns' : 'tls';
            const names = orderNames(d.name, method, state.data.serverName, d.zone, d.hostnames);
            const cert = coveringCert(state.certs, names);
            const task = state.tasks.find((x) => x.domainId === d.id);
            const renewal = renewalState(task);
            const isDefault = !!cert && cert.id === state.data.defaultCertificateId;
            return (
              <li key={d.id} className="space-y-1 px-4 py-3">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[13px]">{names.join(', ')}</p>
                    <p className="text-xs text-muted-foreground">
                      <Link className="text-primary hover:underline" to={`/${domainSection}/x:Domain/${d.id}`}>
                        {d.name}
                      </Link>
                      {' · '}
                      {cert
                        ? t('certOrders.validUntil', 'valid until {{date}}', { date: fmtDate(cert.notValidAfter) })
                        : t('certOrders.noCert', 'not issued yet')}
                      {isDefault && ` · ${t('certOrders.default', 'default certificate')}`}
                    </p>
                  </div>
                  {state.tasksKnown && canOrderAgain(renewal) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy !== null}
                      onClick={() => void orderAgain(d.id, task ? String(task.id) : undefined)}
                    >
                      {busy === d.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                      {t('certOrders.again', 'Order again')}
                    </Button>
                  )}
                </div>
                {state.tasksKnown && <RenewalLine state={renewal} hasCert={!!cert} now={state.at} />}
                {errors[d.id] && <p className="text-xs text-destructive">{errors[d.id]}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function RenewalLine({ state, hasCert, now }: { state: RenewalState; hasCert: boolean; now: number }) {
  const { t } = useTranslation();
  const line = (icon: ReactNode, text: string, tone = 'text-muted-foreground') => (
    <p className={cn('flex items-start gap-1.5 text-xs', tone)}>
      {icon}
      <span>{text}</span>
    </p>
  );
  switch (state.kind) {
    case 'failed':
      return line(
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />,
        t('certOrders.failed', 'The last order failed{{at}}: {{reason}}', {
          at: state.at ? ` ${t('certOrders.on', 'on {{date}}', { date: fmtDate(state.at) })}` : '',
          reason: state.reason || t('certOrders.noReason', 'no reason given'),
        }),
        'text-destructive',
      );
    case 'retry':
      return line(
        <Clock className="mt-px h-3.5 w-3.5 shrink-0" />,
        t('certOrders.retry', 'Failed, trying again {{when}}: {{reason}}', {
          when: state.due
            ? t('certOrders.on', 'on {{date}}', { date: fmtDate(state.due) })
            : t('certOrders.soon', 'soon'),
          reason: state.reason || t('certOrders.noReason', 'no reason given'),
        }),
        'text-amber-700 dark:text-amber-500',
      );
    case 'pending': {
      const later = !!state.due && new Date(state.due).getTime() > now + 3600_000;
      return line(
        <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-600" />,
        !later
          ? t('certOrders.ordering', 'Ordering now.')
          : hasCert
            ? t('certOrders.renews', 'Renews on {{date}}.', { date: fmtDate(state.due!) })
            : t('certOrders.next', 'Next order on {{date}}.', { date: fmtDate(state.due!) }),
      );
    }
    default:
      return line(
        <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />,
        t('certOrders.nothingQueued', 'No renewal is queued. Order again queues one.'),
        'text-amber-700 dark:text-amber-500',
      );
  }
}
