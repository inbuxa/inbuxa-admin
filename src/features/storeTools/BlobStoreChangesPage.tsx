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
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight, Copy as CopyIcon, Square, X } from 'lucide-react';
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
import { dismissChange, fetchChanges, startCopy, stopCopy } from './api';
import {
  changeActions,
  isUnresolved,
  newestFirst,
  parseLimit,
  type BlobStoreChange,
  type ChangeProblem,
} from './model';
import { BlobId, Confirm, Empty, Facts, LimitFields, ProblemTable, ProgressBar } from './parts';
import { number, percentOf, useAction, usePolledList, when } from './hooks';

const copying = (changes: BlobStoreChange[]) => changes.some((c) => c.status === 'copying');

export function BlobStoreChangesPage() {
  const { t } = useTranslation();
  const canAct = useAccountStore((s) => s.hasPermission('sysBlobStoreChange'));
  const { load, refetch } = usePolledList(
    fetchChanges,
    copying,
    t(
      'blobStoreChange.unavailable',
      'This server doesn’t track blob store changes. It needs inbuxa 27.1-rc.16 or 2026.11.9.1 or newer.',
    ),
  );
  const changes = load.kind === 'ready' ? newestFirst(load.items, (c) => c.changedAt) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="arrow-right-left"
        title={t('blobStoreChange.title', 'Blob store changes')}
        subtitle={t(
          'blobStoreChange.subtitle',
          'Changing the blob store setting moves nothing. Until what’s in the old store is copied over, the server reads anything it can’t find from there.',
        )}
      />

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
  const [dialog, setDialog] = useState<'copy' | 'stop' | 'dismiss' | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const may = changeActions(change);
  const unresolved = isUnresolved(change);
  const problemCount = change.missing + change.damaged + change.unreadable;
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
            {t('blobStoreChange.changedAt', 'Noticed {{when}} by node {{node}}', {
              when: when(change.changedAt),
              node: change.node,
            })}
          </div>
        </div>
        {canAct && (
          <div className="flex flex-wrap gap-2">
            {may.copy && (
              <Button size="sm" onClick={() => setDialog('copy')}>
                <CopyIcon className="mr-2 h-4 w-4" />
                {change.copyStartedAt
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
          <ProgressBar share={change.progress} label={t('blobStoreChange.progress', 'Copy progress')} />
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

      {problemCount > 0 && (
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
      {dialog === 'stop' && (
        <Confirm
          title={t('blobStoreChange.stopTitle', 'Stop the copy?')}
          body={t(
            'blobStoreChange.stopBody',
            'It stops within about ten seconds. What it copied stays copied, and the server keeps reading the rest from the old store.',
          )}
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
            unresolved ? (
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
          <DialogTitle>{t('blobStoreChange.copyTitle', 'Copy to the new blob store')}</DialogTitle>
          <DialogDescription>
            {t(
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
