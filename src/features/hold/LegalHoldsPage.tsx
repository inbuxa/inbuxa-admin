/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Legal holds (audit-hold-lock spec, LH-1
 * to LH-14). Active holds with what each covers and keeps; released ones
 * stay listed, read-only, for the audit trail.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileArchive, Pencil, Scale, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { fetchHolds, formatSize, HOLD_CHANGED, HoldsUnavailable, type LegalHold } from './legalHold';
import { HoldDialog, ReleaseDialog, ScopeSummary } from './HoldDialogs';
import { fetchExports, type HoldExport } from './holdExport';
import { ExportDialog, ExportList } from './HoldExports';
import { usePollWhileRunning } from './usePollWhileRunning';

type Load = { kind: 'loading' } | { kind: 'ready'; holds: LegalHold[] } | { kind: 'error'; message: string };

function rangeText(t: (k: string, f: string, o?: Record<string, string>) => string, hold: LegalHold): string {
  if (!hold.from && !hold.to) return t('hold.allDates', 'Everything, whatever its date');
  if (hold.from && hold.to) return t('hold.between', '{{from}} to {{to}}', { from: hold.from, to: hold.to });
  if (hold.from) return t('hold.since', 'From {{from}}, and mail still to come', { from: hold.from });
  return t('hold.until', 'Up to {{to}}', { to: hold.to });
}

export function LegalHoldsPage() {
  const { t } = useTranslation();
  const canCreate = useAccountStore((s) => s.hasPermission('sysLegalHoldCreate'));
  const canUpdate = useAccountStore((s) => s.hasPermission('sysLegalHoldUpdate'));
  const canExport = useAccountStore((s) => s.hasPermission('sysLegalHoldExport'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [editing, setEditing] = useState<LegalHold | null>(null);
  const [releasing, setReleasing] = useState<LegalHold | null>(null);
  const [exporting, setExporting] = useState<LegalHold | null>(null);
  const [exports, setExports] = useState<HoldExport[]>([]);
  const [exportFetches, setExportFetches] = useState(0);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);
  const refetchExports = useCallback(() => setExportFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchHolds(controller.signal)
      .then((holds) => {
        if (!controller.signal.aborted) setLoad({ kind: 'ready', holds });
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof HoldsUnavailable
              ? t('hold.unavailable', 'This server can’t place legal holds.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  useEffect(() => {
    if (!canExport) return;
    const controller = new AbortController();
    fetchExports(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setExports(list);
      })
      .catch(() => {
        // An older server has no exports; the holds still show
      });
    return () => controller.abort();
  }, [canExport, exportFetches]);

  usePollWhileRunning(exports, refetchExports);

  const done = () => {
    setPlacing(false);
    setEditing(null);
    setReleasing(null);
    window.dispatchEvent(new Event(HOLD_CHANGED));
    refetch();
  };

  const active = load.kind === 'ready' ? load.holds.filter((h) => !h.released) : [];
  const released = load.kind === 'ready' ? load.holds.filter((h) => h.released) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="scale"
        title={t('hold.title', 'Legal holds')}
        subtitle={t(
          'hold.subtitle',
          'Nothing a hold covers can be destroyed, by anyone, until it is released: deletions are kept with no expiry and deleted accounts keep their data. People aren’t told.',
        )}
        actions={
          canCreate && (
            <Button onClick={() => setPlacing(true)}>
              <Scale className="mr-2 h-4 w-4" />
              {t('hold.placeAction', 'Place a hold…')}
            </Button>
          )
        }
      />

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && active.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('hold.none', 'No hold is in place.')}
        </div>
      )}
      {active.map((hold) => (
        <div key={hold.id} className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 font-medium">
                <Scale className="h-4 w-4 text-primary" />
                {hold.name}
                {hold.reference && <Badge variant="outline">{hold.reference}</Badge>}
              </div>
              <div className="text-sm text-muted-foreground">
                {t('hold.placedBy', 'Placed {{when}} by {{who}}', {
                  when: new Date(hold.placedAt).toLocaleString(),
                  who: hold.placedBy,
                })}
              </div>
              {hold.description && <div className="text-sm">{hold.description}</div>}
            </div>
            {(canUpdate || canExport) && (
              <div className="flex gap-2">
                {canExport && (
                  <Button variant="outline" size="sm" onClick={() => setExporting(hold)}>
                    <FileArchive className="mr-2 h-4 w-4" />
                    {t('hold.export.action', 'Export…')}
                  </Button>
                )}
                {canUpdate && (
                  <Button variant="outline" size="sm" onClick={() => setEditing(hold)}>
                    <Pencil className="mr-2 h-4 w-4" />
                    {t('hold.widenAction', 'Widen…')}
                  </Button>
                )}
                {canUpdate && (
                  <Button variant="outline" size="sm" onClick={() => setReleasing(hold)}>
                    <Unlock className="mr-2 h-4 w-4" />
                    {t('hold.releaseAction', 'Release…')}
                  </Button>
                )}
              </div>
            )}
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="space-y-1">
              <div className="text-muted-foreground">{t('hold.covers', 'What it covers')}</div>
              <ScopeSummary scope={hold.scope} />
              <div className="text-muted-foreground">{rangeText(t, hold)}</div>
            </div>
            <div className="space-y-1">
              <div className="text-muted-foreground">{t('hold.keeps', 'What it keeps now')}</div>
              <div>
                {[
                  hold.accountsCovered === 1
                    ? t('hold.oneAccount', '1 account')
                    : t('hold.accounts', '{{n}} accounts', { n: String(hold.accountsCovered ?? 0) }),
                  hold.itemsHeld === 1
                    ? t('hold.oneItem', '1 deleted item kept')
                    : t('hold.items', '{{n}} deleted items kept', { n: String(hold.itemsHeld ?? 0) }),
                  formatSize(hold.sizeHeld),
                ].join(' · ')}
              </div>
            </div>
          </div>
          <ExportList hold={hold} exports={exports.filter((e) => e.holdId === hold.id)} />
        </div>
      ))}

      {released.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-medium text-muted-foreground">{t('hold.releasedHeading', 'Released')}</h2>
          {released.map((hold) => (
            <div key={hold.id} className="rounded-xl border p-4 text-sm text-muted-foreground">
              <div className="flex flex-wrap items-center gap-2 font-medium text-foreground">
                {hold.name}
                {hold.reference && <Badge variant="outline">{hold.reference}</Badge>}
              </div>
              <div>
                {t('hold.releasedBy', 'Placed {{placed}} by {{placedBy}}; released {{when}} by {{who}}: {{why}}', {
                  placed: new Date(hold.placedAt).toLocaleDateString(),
                  placedBy: hold.placedBy,
                  when: hold.releasedAt ? new Date(hold.releasedAt).toLocaleString() : '',
                  who: hold.releasedBy ?? '',
                  why: hold.releaseReason ?? '',
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {placing && <HoldDialog onClose={() => setPlacing(false)} onDone={done} />}
      {editing && <HoldDialog existing={editing} onClose={() => setEditing(null)} onDone={done} />}
      {exporting && (
        <ExportDialog
          hold={exporting}
          onClose={() => setExporting(null)}
          onStarted={() => {
            setExporting(null);
            refetchExports();
          }}
        />
      )}
      {releasing && <ReleaseDialog hold={releasing} onClose={() => setReleasing(null)} onDone={done} />}
    </div>
  );
}
