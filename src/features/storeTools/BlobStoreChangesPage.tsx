/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Storage › Blob store changes (inbuxa-server
 * docs/spec/features/blob-store-change.md). Each time the blob store setting
 * moved, the server recorded it and reads through to the old store until the
 * rest is copied. Copy, stop a copy, read what it couldn't copy, or dismiss.
 * A change can also be planned ahead, copied ahead while the current store
 * stays the blob store, and then written to the setting
 * (blob-store-copy-ahead.md). Once a change is resolved, the blobs left in the
 * old store can be previewed and cleaned up (blob-store-cleanup.md).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight, CalendarClock, Check, Copy as CopyIcon, Eraser, Square, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatSize } from '@/lib/durationFormat';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { applyChange, cleanUpOldStore, dismissChange, fetchChanges, startCopy, stopCopy } from './api';
import {
  changeActions,
  cleanupKept,
  isBusy,
  isCleaningUp,
  isPlanned,
  isUnresolved,
  newestFirst,
  parseLimit,
  planBlocked,
  type BlobStoreChange,
  type ChangeProblem,
  type Cleanup,
} from './model';
import { BlobId, Confirm, Empty, Facts, LimitFields, ProblemTable, ProgressBar } from './parts';
import { number, percentOf, useAction, usePolledList, when } from './hooks';
import { PlanChangeDialog } from './PlanChangeDialog';

const running = (changes: BlobStoreChange[]) => changes.some(isBusy);

export function BlobStoreChangesPage() {
  const { t } = useTranslation();
  const canAct = useAccountStore((s) => s.hasPermission('sysBlobStoreChange'));
  const { load, refetch } = usePolledList(
    fetchChanges,
    running,
    t(
      'blobStoreChange.unavailable',
      'This server doesn’t track blob store changes. It needs inbuxa 27.1-rc.16 or 2026.11.9.1 or newer.',
    ),
  );
  // A planned change hasn't happened yet, so it heads the list.
  const changes = load.kind === 'ready' ? newestFirst(load.items, (c) => c.changedAt ?? '~') : [];
  const blocked = planBlocked(changes);
  const [planning, setPlanning] = useState(false);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="arrow-right-left"
        title={t('blobStoreChange.title', 'Blob store changes')}
        subtitle={t(
          'blobStoreChange.subtitle',
          'Changing the blob store setting moves nothing. Until what’s in the old store is copied over, the server reads anything it can’t find from there.',
        )}
        actions={
          canAct &&
          load.kind === 'ready' && (
            <Button size="sm" onClick={() => setPlanning(true)} disabled={blocked !== null}>
              <CalendarClock className="mr-2 h-4 w-4" />
              {t('blobStoreChange.plan', 'Plan a change…')}
            </Button>
          )
        }
      />
      {canAct && load.kind === 'ready' && blocked && (
        <p className="text-sm text-muted-foreground">
          {blocked === 'planned'
            ? t(
                'blobStoreChange.planBlockedPlanned',
                'A change is planned already. Another can be planned once the nodes run on it, or once it’s dismissed.',
              )
            : t(
                'blobStoreChange.planBlockedUnresolved',
                'A change can be planned once the last one is copied or dismissed: copying ahead reads the current store only.',
              )}
        </p>
      )}
      {planning && (
        <PlanChangeDialog
          onClose={() => setPlanning(false)}
          onPlanned={() => {
            setPlanning(false);
            refetch();
          }}
        />
      )}

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && <Empty>{load.message}</Empty>}
      {load.kind === 'ready' && changes.length === 0 && (
        <Empty>{t('blobStoreChange.none', 'The blob store hasn’t moved since this server started tracking it.')}</Empty>
      )}
      {changes.map((change) => (
        <ChangeCard key={change.id} change={change} canAct={canAct} onChanged={refetch} />
      ))}
    </div>
  );
}

function StatusBadge({ change }: { change: BlobStoreChange }) {
  const { t } = useTranslation();
  if (isPlanned(change)) {
    // CA-2: nothing reads from a planned store, so an unfinished copy ahead isn't a problem yet.
    switch (change.status) {
      case 'copying':
        return <Badge variant="outline">{t('blobStoreChange.status.copyingAhead', 'Copying ahead')}</Badge>;
      case 'copied':
        return <Badge variant="secondary">{t('blobStoreChange.status.copiedAhead', 'Copied ahead')}</Badge>;
      case 'pending':
        return <Badge variant="outline">{t('blobStoreChange.status.planned', 'Planned')}</Badge>;
      default:
        break;
    }
  }
  switch (change.status) {
    case 'pending':
      return <Badge variant="destructive">{t('blobStoreChange.status.pending', 'Not copied yet')}</Badge>;
    case 'copying':
      return <Badge variant="outline">{t('blobStoreChange.status.copying', 'Copying')}</Badge>;
    case 'copied':
      return <Badge variant="secondary">{t('blobStoreChange.status.copied', 'Copied')}</Badge>;
    case 'incomplete':
      return <Badge variant="destructive">{t('blobStoreChange.status.incomplete', 'Copy incomplete')}</Badge>;
    case 'stopped':
      return <Badge variant="destructive">{t('blobStoreChange.status.stopped', 'Copy stopped')}</Badge>;
    case 'failed':
      return <Badge variant="destructive">{t('blobStoreChange.status.failed', 'Copy failed')}</Badge>;
    case 'interrupted':
      return <Badge variant="destructive">{t('blobStoreChange.status.interrupted', 'Copy interrupted')}</Badge>;
    case 'reverted':
      return <Badge variant="secondary">{t('blobStoreChange.status.reverted', 'Moved back')}</Badge>;
  }
}

/** What held a blob a copy couldn't copy (BM-5). */
const holderLabel = (t: TFunction, holder: string) =>
  ({
    email: t('blobStoreChange.holder.email', 'Message'),
    file: t('blobStoreChange.holder.file', 'File'),
    queuedMessage: t('blobStoreChange.holder.queuedMessage', 'Queued message'),
    archivedItem: t('blobStoreChange.holder.archivedItem', 'Kept deleted item'),
    temporary: t('blobStoreChange.holder.temporary', 'Upload'),
    fixed: t('blobStoreChange.holder.fixed', 'Server file'),
  })[holder] ?? holder;

const kindLabel = (t: TFunction, kind: ChangeProblem['kind']) =>
  ({
    missing: t('blobStoreChange.kind.missing', 'In neither store'),
    damaged: t('blobStoreChange.kind.damaged', 'Damaged in the old store'),
    unreadable: t('blobStoreChange.kind.unreadable', 'Unreadable'),
    different: t('blobStoreChange.cleanupKind.different', 'Different in the current store'),
  })[kind];

/** OC-4: why a cleanup kept a blob in the old store. */
const cleanupKindLabel = (t: TFunction, kind: ChangeProblem['kind']) =>
  ({
    missing: t('blobStoreChange.cleanupKind.missing', 'Not in the current store'),
    damaged: t('blobStoreChange.cleanupKind.damaged', 'Damaged in the current store'),
    different: t('blobStoreChange.cleanupKind.different', 'Different in the current store'),
    unreadable: t('blobStoreChange.kind.unreadable', 'Unreadable'),
  })[kind];

function ChangeCard({
  change,
  canAct,
  onChanged,
}: {
  change: BlobStoreChange;
  canAct: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [dialog, setDialog] = useState<'copy' | 'stop' | 'dismiss' | 'apply' | 'cleanUp' | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const may = changeActions(change);
  const unresolved = isUnresolved(change);
  const planned = isPlanned(change);
  const problemCount = change.missing + change.damaged + change.unreadable;
  const cleaning = isCleaningUp(change);
  const done = () => {
    setDialog(null);
    onChanged();
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span className="min-w-0 [overflow-wrap:anywhere]">{change.from}</span>
            <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 [overflow-wrap:anywhere]">{change.to}</span>
            <StatusBadge change={change} />
          </div>
          <div className="text-sm text-muted-foreground">
            {planned
              ? t('blobStoreChange.plannedNote', 'Planned. The current store stays the blob store until this one is.')
              : t('blobStoreChange.changedAt', 'Noticed {{when}} by node {{node}}', {
                  when: when(change.changedAt),
                  node: change.node ?? '',
                })}
          </div>
        </div>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {may.apply && (
              <Button size="sm" onClick={() => setDialog('apply')}>
                <Check className="mr-2 h-4 w-4" />
                {t('blobStoreChange.apply', 'Make it the blob store…')}
              </Button>
            )}
            {may.cleanUp && (
              <Button size="sm" variant="outline" onClick={() => setDialog('cleanUp')}>
                <Eraser className="mr-2 h-4 w-4" />
                {t('blobStoreChange.cleanUp', 'Clean up the old store…')}
              </Button>
            )}
            {may.copy && (
              <Button size="sm" variant={may.apply ? 'outline' : 'default'} onClick={() => setDialog('copy')}>
                <CopyIcon className="mr-2 h-4 w-4" />
                {planned
                  ? change.copyStartedAt
                    ? t('blobStoreChange.copyAheadAgain', 'Copy ahead again…')
                    : t('blobStoreChange.copyAhead', 'Copy ahead…')
                  : change.copyStartedAt
                    ? t('blobStoreChange.copyAgain', 'Copy again…')
                    : t('blobStoreChange.copy', 'Copy…')}
              </Button>
            )}
            {may.stop && (
              <Button variant="outline" size="sm" onClick={() => setDialog('stop')}>
                <Square className="mr-2 h-4 w-4" />
                {t('blobStoreChange.stop', 'Stop')}
              </Button>
            )}
            {may.dismiss && (
              <Button variant="outline" size="sm" onClick={() => setDialog('dismiss')}>
                <X className="mr-2 h-4 w-4" />
                {t('blobStoreChange.dismiss', 'Dismiss…')}
              </Button>
            )}
          </div>
        )}
      </div>

      {unresolved && change.status !== 'copying' && (
        <p className="text-sm">
          {t(
            'blobStoreChange.readingThrough',
            'Mail written before the change is still read from the old store. Copy it over, then the old store is no longer needed by the server.',
          )}
        </p>
      )}
      {planned && !change.appliedAt && change.status !== 'copying' && (
        <p className="text-sm">
          {change.status === 'copied'
            ? t(
                'blobStoreChange.plannedCopied',
                'Everything is copied ahead. Make it the blob store, then restart the nodes; the copy after that picks up only what arrived since.',
              )
            : t(
                'blobStoreChange.plannedHint',
                'Copy ahead into the new store. Mail keeps going to the current store meanwhile, and what’s deleted there is deleted here too.',
              )}
        </p>
      )}
      {change.appliedAt && (
        <p className="text-sm">
          {t(
            'blobStoreChange.appliedNote',
            'Written to the blob store setting {{when}} by {{who}}. It takes effect as each node restarts.',
            { when: when(change.appliedAt), who: change.appliedBy ?? '' },
          )}
        </p>
      )}
      {change.copiedAhead && (
        <div className="text-sm text-muted-foreground">
          {t(
            'blobStoreChange.copiedAheadNote',
            'Copied ahead before the change: {{copied}} copied, {{already}} already there, {{size}} ({{status}}).',
            {
              copied: number(change.copiedAhead.copied),
              already: number(change.copiedAhead.alreadyThere),
              size: formatSize(change.copiedAhead.bytesCopied),
              status:
                change.copiedAhead.status === 'copied'
                  ? t('blobStoreChange.copiedAheadDone', 'finished')
                  : t('blobStoreChange.copiedAheadUnfinished', 'unfinished'),
            },
          )}
        </div>
      )}
      {change.status === 'copied' && !planned && change.oldStoreKept && !change.cleanup && (
        <p className="text-sm text-muted-foreground">
          {t(
            'blobStoreChange.oldStoreKept',
            'The old store still has a copy of every blob it held. Clean it up once backups of the data store taken before this change have aged out: they need those blobs to restore.',
          )}
        </p>
      )}
      {change.cleanup && <CleanupSummary cleanup={change.cleanup} oldStoreKept={change.oldStoreKept} />}
      {change.status === 'reverted' && (
        <p className="text-sm text-muted-foreground">
          {t(
            'blobStoreChange.revertedHint',
            'The setting went back to the store this change moved away from, so nothing needs copying for it.',
          )}
        </p>
      )}

      {change.status === 'copying' && (
        <div className="space-y-1">
          <ProgressBar
            share={change.progress}
            label={
              planned
                ? t('blobStoreChange.progressAhead', 'Copy ahead progress')
                : t('blobStoreChange.progress', 'Copy progress')
            }
          />
          <div className="text-xs text-muted-foreground">{percentOf(change.progress)}</div>
        </div>
      )}

      {change.copyStartedAt && (
        <>
          <div className="text-sm text-muted-foreground">
            {change.copyFinishedAt
              ? t('blobStoreChange.copyRan', 'Latest copy: {{start}} to {{end}}, by {{who}} on node {{node}}', {
                  start: when(change.copyStartedAt),
                  end: when(change.copyFinishedAt),
                  who: change.copyStartedBy ?? '',
                  node: change.copyNode ?? '',
                })
              : t('blobStoreChange.copyStarted', 'Copy started {{start}} by {{who}} on node {{node}}', {
                  start: when(change.copyStartedAt),
                  who: change.copyStartedBy ?? '',
                  node: change.copyNode ?? '',
                })}
          </div>
          <Facts
            items={[
              [t('blobStoreChange.checked', 'Blobs looked at'), number(change.blobsChecked)],
              [t('blobStoreChange.copied', 'Copied'), number(change.copied)],
              [t('blobStoreChange.alreadyThere', 'Already there'), number(change.alreadyThere)],
              [t('blobStoreChange.bytesCopied', 'Data copied'), formatSize(change.bytesCopied)],
            ]}
          />
        </>
      )}

      {change.status === 'failed' && change.error && <div className="text-sm text-destructive">{change.error}</div>}
      {change.status === 'interrupted' && (
        <p className="text-sm text-muted-foreground">
          {t(
            'blobStoreChange.interruptedHint',
            'Its node restarted or stopped answering. Copy again; what’s already there is skipped.',
          )}
        </p>
      )}

      {problemCount > 0 && !change.cleanup && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {(
              [
                ['missing', change.missing, kindLabel(t, 'missing')],
                ['damaged', change.damaged, kindLabel(t, 'damaged')],
                ['unreadable', change.unreadable, kindLabel(t, 'unreadable')],
              ] as const
            )
              .filter(([, n]) => n > 0)
              .map(([kind, n, label]) => (
                <Badge key={kind} variant="outline">
                  {label}: {number(n)}
                </Badge>
              ))}
            {change.problems.length > 0 && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowProblems((v) => !v)}>
                {showProblems
                  ? t('blobStoreChange.hideProblems', 'Hide what wasn’t copied')
                  : t('blobStoreChange.showProblems', 'Show what wasn’t copied')}
              </Button>
            )}
          </div>
          {showProblems && (
            <ProblemTable
              heads={[
                t('blobStoreChange.col.kind', 'Problem'),
                t('blobStoreChange.col.holder', 'Held by'),
                t('blobStoreChange.col.blob', 'Blob'),
                t('blobStoreChange.col.detail', 'Detail'),
              ]}
              rows={change.problems.map((p, i) => ({
                key: `${p.blobId}-${i}`,
                cells: [
                  kindLabel(t, p.kind),
                  [
                    holderLabel(t, p.holder),
                    p.objectId ?? '',
                    p.accountId ? t('blobStoreChange.inAccount', 'in account {{id}}', { id: p.accountId }) : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                  <BlobId key="b" id={p.blobId} />,
                  p.detail,
                ],
              }))}
              kept={change.problems.length}
              total={problemCount}
            />
          )}
        </div>
      )}

      {dialog === 'copy' && <CopyDialog change={change} onClose={() => setDialog(null)} onStarted={done} />}
      {dialog === 'cleanUp' && <CleanupDialog change={change} onClose={() => setDialog(null)} onStarted={done} />}
      {dialog === 'apply' && (
        <Confirm
          title={t('blobStoreChange.applyTitle', 'Make it the blob store?')}
          body={
            <>
              <p>
                {t(
                  'blobStoreChange.applyBody',
                  'The blob store setting becomes {{to}}, with the settings given when it was planned. It takes effect as each node restarts.',
                  { to: change.to },
                )}
              </p>
              <p>
                {t(
                  'blobStoreChange.applyAfter',
                  'Once every node runs on it, copy again: the last pass copies only what arrived after the copy ahead.',
                )}
              </p>
            </>
          }
          action={t('blobStoreChange.applyGo', 'Make it the blob store')}
          busy={busy}
          onConfirm={() =>
            void run(t('blobStoreChange.applyFailed', 'The blob store setting wasn’t changed'), () =>
              applyChange(change.id),
            ).then((ok) => ok && done())
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'stop' && (
        <Confirm
          title={
            cleaning
              ? t('blobStoreChange.stopCleanupTitle', 'Stop the cleanup?')
              : t('blobStoreChange.stopTitle', 'Stop the copy?')
          }
          body={
            cleaning
              ? t(
                  'blobStoreChange.stopCleanupBody',
                  'It stops within about ten seconds. What it deleted stays deleted; the rest stays in the old store, and it can run again.',
                )
              : t(
                  'blobStoreChange.stopBody',
                  'It stops within about ten seconds. What it copied stays copied, and the server keeps reading the rest from the old store.',
                )
          }
          action={t('blobStoreChange.stop', 'Stop')}
          busy={busy}
          onConfirm={() =>
            void run(t('blobStoreChange.stopFailed', 'The copy wasn’t stopped'), () => stopCopy(change.id)).then(
              (ok) => ok && done(),
            )
          }
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === 'dismiss' && (
        <Confirm
          title={t('blobStoreChange.dismissTitle', 'Dismiss this change?')}
          destructive={unresolved}
          body={
            planned ? (
              t(
                'blobStoreChange.dismissPlanned',
                'The plan and the new store’s settings are forgotten, and the blob store setting stays as it is. What was copied ahead stays in the new store; clearing it out is up to you.',
              )
            ) : unresolved ? (
              <>
                <p>
                  {t(
                    'blobStoreChange.dismissUnresolved',
                    'The server stops reading from the old store. Any message, file or attachment only the old store has will be missing.',
                  )}
                </p>
                <p>
                  {t(
                    'blobStoreChange.dismissNothingDeleted',
                    'Nothing is deleted from either store. Only dismiss if you copied the old store’s contents over some other way, or no longer need them.',
                  )}
                </p>
              </>
            ) : change.oldStoreKept ? (
              t(
                'blobStoreChange.dismissKept',
                'It’s forgotten, and so is the old store: it can’t be cleaned up from here afterwards. Nothing is deleted from either store.',
              )
            ) : (
              t(
                'blobStoreChange.dismissResolved',
                'It’s forgotten. Nothing is deleted from either store; clearing out the old one is up to you.',
              )
            )
          }
          action={t('blobStoreChange.dismissGo', 'Dismiss')}
          busy={busy}
          onConfirm={() =>
            void run(t('blobStoreChange.dismissFailed', 'The change wasn’t dismissed'), () =>
              dismissChange(change.id),
            ).then((ok) => ok && done())
          }
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function CopyDialog({
  change,
  onClose,
  onStarted,
}: {
  change: BlobStoreChange;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const [blobs, setBlobs] = useState('');
  const [bytes, setBytes] = useState('');
  const { busy, run } = useAction();
  const blobsLimit = parseLimit(blobs);
  const bytesLimit = parseLimit(bytes);
  const invalid = blobsLimit === 'invalid' || bytesLimit === 'invalid';

  const start = async () => {
    if (invalid) return;
    const ok = await run(t('blobStoreChange.notStarted', 'The copy didn’t start'), () =>
      startCopy(change.id, blobsLimit, bytesLimit),
    );
    if (ok) {
      toast({ title: t('blobStoreChange.started', 'Copy started') });
      onStarted();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isPlanned(change)
              ? t('blobStoreChange.copyAheadTitle', 'Copy ahead to the planned store')
              : t('blobStoreChange.copyTitle', 'Copy to the new blob store')}
          </DialogTitle>
          <DialogDescription>
            {isPlanned(change)
              ? t(
                  'blobStoreChange.copyAheadBody',
                  'Copies every blob the server needs from {{from}} to {{to}}, checking each message’s content as it goes, while {{from}} stays the blob store. What’s already there is skipped. One copy runs at a time.',
                  { from: change.from, to: change.to },
                )
              : t(
                  'blobStoreChange.copyBody',
                  'Copies every blob the server still needs from {{from}} to {{to}}, checking each message’s content as it goes. What’s already there is skipped. Start it once every node runs the new setting. One copy runs at a time.',
                  { from: change.from, to: change.to },
                )}
          </DialogDescription>
        </DialogHeader>
        <LimitFields blobs={blobs} bytes={bytes} onBlobs={setBlobs} onBytes={setBytes} />
        {invalid && (
          <p className="text-sm text-destructive">{t('storeTools.limitInvalid', 'A limit is a whole number.')}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void start()} disabled={busy || invalid}>
            <CopyIcon className="mr-2 h-4 w-4" />
            {t('blobStoreChange.copyGo', 'Start copying')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** OC-5, OC-6: the latest cleanup or preview, and what it left. */
function CleanupSummary({ cleanup, oldStoreKept }: { cleanup: Cleanup; oldStoreKept: boolean }) {
  const { t } = useTranslation();
  const [showProblems, setShowProblems] = useState(false);
  const kept = cleanupKept(cleanup);
  const facts = {
    deleted: number(cleanup.deleted),
    size: formatSize(cleanup.bytesFreed),
    kept: number(kept),
  };
  return (
    <div className="space-y-2 rounded-lg border border-dashed p-3">
      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {cleanup.dryRun
          ? t('blobStoreChange.cleanupPreview', 'Cleanup preview')
          : t('blobStoreChange.cleanupRun', 'Cleanup of the old store')}
        <CleanupBadge cleanup={cleanup} />
      </div>
      <div className="text-sm text-muted-foreground">
        {cleanup.finishedAt
          ? t('blobStoreChange.cleanupRan', '{{start}} to {{end}}, by {{who}} on node {{node}}', {
              start: when(cleanup.startedAt),
              end: when(cleanup.finishedAt),
              who: cleanup.startedBy,
              node: cleanup.node,
            })
          : t('blobStoreChange.cleanupStarted', 'Started {{start}} by {{who}} on node {{node}}', {
              start: when(cleanup.startedAt),
              who: cleanup.startedBy,
              node: cleanup.node,
            })}
      </div>
      {cleanup.status === 'running' && (
        <div className="space-y-1">
          <ProgressBar share={cleanup.progress} label={t('blobStoreChange.cleanupProgress', 'Cleanup progress')} />
          <div className="text-xs text-muted-foreground">{percentOf(cleanup.progress)}</div>
        </div>
      )}
      <Facts
        items={[
          [t('blobStoreChange.checked', 'Blobs looked at'), number(cleanup.blobsChecked)],
          [
            cleanup.dryRun
              ? t('blobStoreChange.wouldDelete', 'Would be deleted')
              : t('blobStoreChange.deleted', 'Deleted'),
            facts.deleted,
          ],
          [
            cleanup.dryRun
              ? t('blobStoreChange.wouldFree', 'Space it would free')
              : t('blobStoreChange.freed', 'Freed'),
            facts.size,
          ],
          [t('blobStoreChange.keptInOld', 'Kept in the old store'), facts.kept],
          [t('blobStoreChange.notThere', 'Not in the old store'), number(cleanup.notThere)],
        ]}
      />
      {cleanup.status === 'done' && !cleanup.dryRun && (
        <p className="text-sm">
          {t(
            'blobStoreChange.cleanupDone',
            'None of the server’s blobs are in the old store any more, and the server has forgotten its settings. Anything still in it isn’t the server’s: for a directory or bucket of its own, you can delete what’s left. The space comes back as that store reclaims it (a compaction, a vacuum, or the bucket’s own rules).',
          )}
        </p>
      )}
      {cleanup.status === 'done' && cleanup.dryRun && oldStoreKept && (
        <p className="text-sm">
          {t(
            'blobStoreChange.previewDone',
            'Nothing was deleted. Clean up for real once backups of the data store taken before this change have aged out.',
          )}
        </p>
      )}
      {kept > 0 && (
        <p className="text-sm">
          {t(
            'blobStoreChange.cleanupKeptHint',
            'These stay in the old store because the current store’s copy didn’t check out. Run a full store check, put them right, and clean up again.',
          )}
        </p>
      )}
      {cleanup.snapshotsBefore > 0 && (
        <p className="text-sm text-muted-foreground">
          {t(
            'blobStoreChange.snapshotsBefore',
            '{{count}} snapshots from before the change still hold the old blobs; their space comes back when they’re deleted.',
            { count: cleanup.snapshotsBefore },
          )}
        </p>
      )}
      {cleanup.status === 'failed' && cleanup.error && <div className="text-sm text-destructive">{cleanup.error}</div>}
      {cleanup.status === 'interrupted' && (
        <p className="text-sm text-muted-foreground">
          {t(
            'blobStoreChange.cleanupInterruptedHint',
            'Its node restarted or stopped answering. Run it again; what’s already deleted is skipped.',
          )}
        </p>
      )}
      {cleanup.problems.length > 0 && (
        <div className="space-y-2">
          <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowProblems((v) => !v)}>
            {showProblems
              ? t('blobStoreChange.hideKept', 'Hide what was kept')
              : t('blobStoreChange.showKept', 'Show what was kept')}
          </Button>
          {showProblems && (
            <ProblemTable
              heads={[
                t('blobStoreChange.col.kind', 'Problem'),
                t('blobStoreChange.col.holder', 'Held by'),
                t('blobStoreChange.col.blob', 'Blob'),
                t('blobStoreChange.col.detail', 'Detail'),
              ]}
              rows={cleanup.problems.map((p, i) => ({
                key: `${p.blobId}-${i}`,
                cells: [
                  cleanupKindLabel(t, p.kind),
                  [
                    holderLabel(t, p.holder),
                    p.objectId ?? '',
                    p.accountId ? t('blobStoreChange.inAccount', 'in account {{id}}', { id: p.accountId }) : '',
                  ]
                    .filter(Boolean)
                    .join(' '),
                  <BlobId key="b" id={p.blobId} />,
                  p.detail,
                ],
              }))}
              kept={cleanup.problems.length}
              total={kept}
            />
          )}
        </div>
      )}
    </div>
  );
}

function CleanupBadge({ cleanup }: { cleanup: Cleanup }) {
  const { t } = useTranslation();
  switch (cleanup.status) {
    case 'running':
      return <Badge variant="outline">{t('blobStoreChange.cleanupStatus.running', 'Running')}</Badge>;
    case 'done':
      return <Badge variant="secondary">{t('blobStoreChange.cleanupStatus.done', 'Done')}</Badge>;
    case 'incomplete':
      return <Badge variant="destructive">{t('blobStoreChange.cleanupStatus.incomplete', 'Some kept')}</Badge>;
    case 'stopped':
      return <Badge variant="outline">{t('blobStoreChange.cleanupStatus.stopped', 'Stopped')}</Badge>;
    case 'failed':
      return <Badge variant="destructive">{t('blobStoreChange.cleanupStatus.failed', 'Failed')}</Badge>;
    case 'interrupted':
      return <Badge variant="outline">{t('blobStoreChange.cleanupStatus.interrupted', 'Interrupted')}</Badge>;
  }
}

/**
 * OC-5, OC-8: preview a cleanup, or run one. Deleting asks the administrator
 * to say backups from before the change are no longer needed.
 */
function CleanupDialog({
  change,
  onClose,
  onStarted,
}: {
  change: BlobStoreChange;
  onClose: () => void;
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const [blobs, setBlobs] = useState('');
  const [bytes, setBytes] = useState('');
  const [backupsAged, setBackupsAged] = useState(false);
  const { busy, run } = useAction();
  const blobsLimit = parseLimit(blobs);
  const bytesLimit = parseLimit(bytes);
  const invalid = blobsLimit === 'invalid' || bytesLimit === 'invalid';
  const preview = change.cleanup?.dryRun && change.cleanup.status === 'done' ? change.cleanup : null;

  const start = async (dryRun: boolean) => {
    if (invalid || (!dryRun && !backupsAged)) return;
    const ok = await run(t('blobStoreChange.cleanupNotStarted', 'The cleanup didn’t start'), () =>
      cleanUpOldStore(change.id, dryRun, blobsLimit, bytesLimit),
    );
    if (ok) {
      toast({
        title: dryRun
          ? t('blobStoreChange.previewStarted', 'Preview started')
          : t('blobStoreChange.cleanupStartedToast', 'Cleanup started'),
      });
      onStarted();
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('blobStoreChange.cleanupTitle', 'Clean up the old store')}</DialogTitle>
          <DialogDescription>
            {t(
              'blobStoreChange.cleanupBody',
              'Deletes from {{from}} each blob the server holds, once its copy in {{to}} is read back and checks out. A blob that doesn’t check out stays in {{from}} and is listed. Preview first: it counts and deletes nothing.',
              { from: change.from, to: change.to },
            )}
          </DialogDescription>
        </DialogHeader>
        {preview && (
          <p className="text-sm">
            {t(
              'blobStoreChange.previewSays',
              'The last preview ({{when}}) found {{deleted}} blobs ({{size}}) to delete and {{kept}} to keep.',
              {
                when: when(preview.finishedAt ?? preview.startedAt),
                deleted: number(preview.deleted),
                size: formatSize(preview.bytesFreed),
                kept: number(cleanupKept(preview)),
              },
            )}
          </p>
        )}
        <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <p>
            {t(
              'blobStoreChange.cleanupBackups',
              'Backups of the data store taken before this change (noticed {{when}}) read their blobs from {{from}}. Once it’s cleaned up, those backups won’t restore in full.',
              { when: when(change.changedAt), from: change.from },
            )}
          </p>
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={backupsAged}
              onChange={(e) => setBackupsAged(e.target.checked)}
            />
            <span>
              {t(
                'blobStoreChange.cleanupBackupsConfirm',
                'Backups from before this change have aged out, or I don’t need them to restore in full.',
              )}
            </span>
          </label>
        </div>
        <LimitFields blobs={blobs} bytes={bytes} onBlobs={setBlobs} onBytes={setBytes} />
        {invalid && (
          <p className="text-sm text-destructive">{t('storeTools.limitInvalid', 'A limit is a whole number.')}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button variant="outline" onClick={() => void start(true)} disabled={busy || invalid}>
            {t('blobStoreChange.previewGo', 'Preview')}
          </Button>
          <Button variant="destructive" onClick={() => void start(false)} disabled={busy || invalid || !backupsAged}>
            <Eraser className="mr-2 h-4 w-4" />
            {t('blobStoreChange.cleanupGo', 'Delete from the old store')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
