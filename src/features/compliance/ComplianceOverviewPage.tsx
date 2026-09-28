/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Overview (personal-data catalog spec,
 * §7, §8). What the server holds, in four counts, and what has no limit;
 * recent changes that weaken review (audit retention, tracers, webhooks,
 * roles, released holds), each with who and when; and the inventory's
 * history. Facts, never a verdict.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { EMPTY_FILTER, queryEvents, type AuditEvent } from '@/features/audit/auditLog';
import {
  fetchInventory,
  fetchSnapshots,
  InventoryUnavailable,
  itemName,
  unboundedItems,
  type Inventory,
  type Snapshot,
  type Summary,
} from './inventory';

/** Changes that weaken or widen review, shown with who made them (§7). */
const REVIEW_KINDS = [
  'inbuxa:AuditSettings',
  'inbuxa:LogSettings',
  'x:Tracer',
  'x:WebHook',
  'x:Role',
  'inbuxa:LegalHold',
];
const REVIEW_DAYS = 30;

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; inventory: Inventory; snapshots: Snapshot[] }
  | { kind: 'error'; message: string };

function Tile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-3xl font-semibold tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

function changeText(t: (k: string, d: string, o?: Record<string, unknown>) => string, now: Summary, before?: Summary) {
  if (!before) return t('overview.first', 'First record');
  const parts: string[] = [];
  const diff = (key: keyof Summary, label: string) => {
    const d = now[key] - before[key];
    if (d !== 0) parts.push(`${label} ${d > 0 ? '+' : ''}${d}`);
  };
  diff('collected', t('overview.dCollected', 'collected'));
  diff('unbounded', t('overview.dUnbounded', 'no limit'));
  diff('leavingHost', t('overview.dLeaving', 'leaving'));
  diff('processors', t('overview.dHosts', 'hosts'));
  return parts.join(', ') || t('overview.noCount', 'Same counts');
}

export function ComplianceOverviewPage() {
  const { t } = useTranslation();
  const canAudit = useAccountStore((s) => s.hasPermission('sysAuditGet'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [review, setReview] = useState<AuditEvent[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([fetchInventory(controller.signal), fetchSnapshots(controller.signal)])
      .then(([inventory, snapshots]) => !controller.signal.aborted && setLoad({ kind: 'ready', inventory, snapshots }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof InventoryUnavailable
              ? t('inventory.unavailable', 'This server doesn’t report a data inventory.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    if (canAudit) {
      const from = new Date(Date.now() - REVIEW_DAYS * 86_400_000);
      const day = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}-${String(from.getDate()).padStart(2, '0')}`;
      Promise.all(
        REVIEW_KINDS.map((targetKind) =>
          queryEvents({ ...EMPTY_FILTER, from: day, targetKind }, 0, controller.signal).catch(() => ({
            events: [] as AuditEvent[],
            total: 0,
          })),
        ),
      ).then((pages) => {
        if (controller.signal.aborted) return;
        const events = pages
          .flatMap((p) => p.events)
          .filter((e) => e.outcome.status === 'success')
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 20);
        setReview(events);
      });
    }
    return () => controller.abort();
  }, [t, canAudit]);

  if (load.kind === 'loading') return <LoadingFallback />;
  if (load.kind === 'error') {
    return (
      <div className="mx-auto max-w-5xl rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {load.message}
      </div>
    );
  }
  const { inventory, snapshots } = load;
  const unbounded = unboundedItems(inventory.items);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        icon="shield-check"
        title={t('overview.title', 'Compliance overview')}
        subtitle={t(
          'overview.subtitle',
          'What this server holds about people, what has no time limit, who changed what affects review, and when the picture last changed.',
        )}
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          value={inventory.summary.collected}
          label={t('overview.collected', 'Kinds of personal data this server can hold')}
        />
        <Tile value={inventory.summary.unbounded} label={t('overview.unbounded', 'Kept with no time limit')} />
        <Tile value={inventory.summary.leavingHost} label={t('overview.leaving', 'Sent off this server')} />
        <Tile value={inventory.summary.processors} label={t('overview.hosts', 'Hosts receiving personal data')} />
      </div>
      <p className="text-sm">
        <Link className="underline underline-offset-4" to="/Management/CustomComponent/DataInventory">
          {t('overview.toInventory', 'See the data inventory')}
        </Link>
      </p>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t('overview.noLimitTitle', 'Kept with no time limit')}</h2>
        {unbounded.length === 0 ? (
          <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
            {t('overview.noLimitNone', 'Everything this server holds has a limit or goes with what it belongs to.')}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {unbounded.map((item) => (
              <li key={item.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span className="font-medium">{itemName(item.id)}</span>
                <span className="text-muted-foreground">
                  {'setting' in item.retention && item.retention.setting
                    ? t('overview.limitWith', 'A limit can be set: {{setting}}', { setting: item.retention.setting })
                    : t('overview.noSetting', 'No setting limits it')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {canAudit && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">
            {t('overview.reviewTitle', 'Changes that affect review, last {{days}} days', { days: REVIEW_DAYS })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t(
              'overview.reviewBody',
              'Audit and log retention, tracers, webhooks, roles and legal holds, with who changed them. Every one is in the audit log.',
            )}
          </p>
          {review === null ? (
            <LoadingFallback />
          ) : review.length === 0 ? (
            <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
              {t('overview.reviewNone', 'None in this period.')}
            </p>
          ) : (
            <ul className="divide-y rounded-xl border text-sm">
              {review.map((event) => (
                <li key={event.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span>
                    <span className="font-medium">{event.target.name || event.target.kind}</span>{' '}
                    <span className="text-muted-foreground">
                      {event.action}
                      {event.target.name && event.target.name !== event.target.kind && ` · ${event.target.kind}`}
                      {event.reason && ` · ${event.reason}`}
                    </span>
                  </span>
                  <span className="text-muted-foreground">
                    {event.actor.name} · {new Date(event.at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t('overview.historyTitle', 'When the picture changed')}</h2>
        {snapshots.length === 0 ? (
          <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
            {t(
              'overview.historyNone',
              'Nothing recorded yet. A record is made when a setting the inventory reads changes, and checked daily.',
            )}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {snapshots.map((snap, i) => (
              <li key={snap.id} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                <span>
                  <span className="font-medium">{new Date(snap.takenAt).toLocaleString()}</span>{' '}
                  <span className="text-muted-foreground">
                    {snap.trigger.kind === 'settingChanged'
                      ? t('overview.byChange', 'after {{setting}} changed', { setting: snap.trigger.setting })
                      : t('overview.byDaily', 'daily check')}
                  </span>
                </span>
                <span className="text-muted-foreground">{changeText(t, snap.summary, snapshots[i + 1]?.summary)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
