/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Storage › Store check (inbuxa-server
 * docs/spec/features/store-check.md). Start a quick or full check, watch it,
 * stop it, and read what it found. A check changes nothing.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { CircleCheck, Play, Square, Trash2, TriangleAlert } from 'lucide-react';
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
import { deleteCheck, fetchChecks, startCheck, stopCheck } from './api';
import {
  checkProblemCount,
  newestFirst,
  parseLimit,
  type CheckMode,
  type StoreCheck,
  type CheckProblem,
} from './model';
import { BlobId, Confirm, Empty, Facts, LimitFields, ProblemTable, ProgressBar } from './parts';
import { number, percentOf, useAction, usePolledList, when } from './hooks';

const running = (checks: StoreCheck[]) => checks.some((c) => c.status === 'running');

export function StoreCheckPage() {
  const { t } = useTranslation();
  const canCheck = useAccountStore((s) => s.hasPermission('sysStoreCheck'));
  const { load, refetch } = usePolledList(
    fetchChecks,
    running,
    t(
      'storeCheck.unavailable',
      'This server can’t check its store. It needs inbuxa 27.1-rc.16 or 2026.11.9.1 or newer.',
    ),
  );
  const [starting, setStarting] = useState(false);
  const checks = load.kind === 'ready' ? newestFirst(load.items, (c) => c.createdAt) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="stethoscope"
        title={t('storeCheck.title', 'Store check')}
        subtitle={t(
          'storeCheck.subtitle',
          'Checks that every message, file and script still has its content in the blob store. It reads and reports; it changes nothing, and mail keeps flowing while it runs.',
        )}
        actions={
          canCheck && load.kind === 'ready' ? (
            <Button onClick={() => setStarting(true)} disabled={running(load.items)}>
              <Play className="mr-2 h-4 w-4" />
              {t('storeCheck.start', 'Check the store…')}
            </Button>
          ) : undefined
        }
      />

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && <Empty>{load.message}</Empty>}
      {load.kind === 'ready' && checks.length === 0 && (
        <Empty>{t('storeCheck.none', 'The store hasn’t been checked yet.')}</Empty>
      )}
      {checks.map((check) => (
        <CheckCard key={check.id} check={check} canAct={canCheck} onChanged={refetch} />
      ))}
      {load.kind === 'ready' && checks.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('storeCheck.kept', 'The latest 20 checks are kept; starting another forgets the oldest.')}
        </p>
      )}

      {starting && (
        <StartDialog
          onClose={() => setStarting(false)}
          onStarted={() => {
            setStarting(false);
            refetch();
          }}
        />
      )}
    </div>
  );
}

function StatusBadge({ check }: { check: StoreCheck }) {
  const { t } = useTranslation();
  const found = checkProblemCount(check);
  switch (check.status) {
    case 'running':
      return <Badge variant="outline">{t('storeCheck.status.running', 'Running')}</Badge>;
    case 'done':
      return found ? (
        <Badge variant="destructive">
          {found === 1
            ? t('storeCheck.status.oneProblem', '1 problem')
            : t('storeCheck.status.problems', '{{n}} problems', { n: number(found) })}
        </Badge>
      ) : (
        <Badge variant="secondary">{t('storeCheck.status.clean', 'No problems')}</Badge>
      );
    case 'stopped':
      return <Badge variant="outline">{t('storeCheck.status.stopped', 'Stopped')}</Badge>;
    case 'failed':
      return <Badge variant="destructive">{t('storeCheck.status.failed', 'Failed')}</Badge>;
    case 'interrupted':
      return <Badge variant="outline">{t('storeCheck.status.interrupted', 'Interrupted')}</Badge>;
  }
}

/** What needed a blob (SV-4); any other collection comes as its number. */
const objectLabel = (t: TFunction, object: string) =>
  ({
    email: t('storeCheck.object.email', 'Message'),
    file: t('storeCheck.object.file', 'File'),
    sieveScript: t('storeCheck.object.sieveScript', 'Sieve script'),
    calendarEvent: t('storeCheck.object.calendarEvent', 'Calendar event'),
    contactCard: t('storeCheck.object.contactCard', 'Contact'),
    queuedMessage: t('storeCheck.object.queuedMessage', 'Queued message'),
    archivedItem: t('storeCheck.object.archivedItem', 'Kept deleted item'),
  })[object] ?? t('storeCheck.object.other', 'Collection {{n}}', { n: object });

const kindLabel = (t: TFunction, kind: CheckProblem['kind']) =>
  ({
    missing: t('storeCheck.kind.missing', 'Missing'),
    damaged: t('storeCheck.kind.damaged', 'Damaged'),
    unlinked: t('storeCheck.kind.unlinked', 'Unlinked'),
    unreadable: t('storeCheck.kind.unreadable', 'Unreadable'),
  })[kind];

function CheckCard({ check, canAct, onChanged }: { check: StoreCheck; canAct: boolean; onChanged: () => void }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [confirming, setConfirming] = useState<'stop' | 'delete' | null>(null);
  const [showProblems, setShowProblems] = useState(false);
  const found = checkProblemCount(check);

  const act = async () => {
    const ok =
      confirming === 'stop'
        ? await run(t('storeCheck.stopFailed', 'The check wasn’t stopped'), () => stopCheck(check.id))
        : await run(t('storeCheck.deleteFailed', 'The check wasn’t deleted'), () => deleteCheck(check.id));
    if (ok) {
      setConfirming(null);
      onChanged();
    }
  };

  const kinds = (
    [
      ['missing', check.missing, kindLabel(t, 'missing')],
      ['damaged', check.damaged, kindLabel(t, 'damaged')],
      ['unlinked', check.unlinked, kindLabel(t, 'unlinked')],
      ['unreadable', check.unreadable, kindLabel(t, 'unreadable')],
    ] as const
  ).filter(([, n]) => n > 0);

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {check.status === 'done' && !found ? (
              <CircleCheck className="h-4 w-4 text-emerald-600" />
            ) : found ? (
              <TriangleAlert className="h-4 w-4 text-destructive" />
            ) : null}
            {check.mode === 'full' ? t('storeCheck.full', 'Full check') : t('storeCheck.quick', 'Quick check')}
            <StatusBadge check={check} />
          </div>
          <div className="text-sm text-muted-foreground">
            {check.finishedAt
              ? t('storeCheck.ranFrom', '{{start}} to {{end}}, by {{who}} on node {{node}}', {
                  start: when(check.createdAt),
                  end: when(check.finishedAt),
                  who: check.createdBy,
                  node: check.node,
                })
              : t('storeCheck.startedBy', 'Started {{start}} by {{who}} on node {{node}}', {
                  start: when(check.createdAt),
                  who: check.createdBy,
                  node: check.node,
                })}
          </div>
        </div>
        {canAct && (
          <div className="flex gap-2">
            {check.status === 'running' ? (
              <Button variant="outline" size="sm" onClick={() => setConfirming('stop')}>
                <Square className="mr-2 h-4 w-4" />
                {t('storeCheck.stop', 'Stop')}
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setConfirming('delete')}>
                <Trash2 className="mr-2 h-4 w-4" />
                {t('storeCheck.delete', 'Delete')}
              </Button>
            )}
          </div>
        )}
      </div>

      {check.status === 'running' && (
        <div className="space-y-1">
          <ProgressBar share={check.progress} label={t('storeCheck.progress', 'Progress')} />
          <div className="text-xs text-muted-foreground">{percentOf(check.progress)}</div>
        </div>
      )}

      <Facts
        items={[
          [t('storeCheck.blobs', 'Blobs checked'), number(check.blobsChecked)],
          [t('storeCheck.links', 'Links checked'), number(check.linksChecked)],
          [t('storeCheck.messages', 'Messages checked'), number(check.messagesChecked)],
          ...(check.mode === 'full'
            ? ([[t('storeCheck.read', 'Read'), formatSize(check.bytesRead)]] as [string, string][])
            : []),
        ]}
      />

      {check.status === 'failed' && check.error && <div className="text-sm text-destructive">{check.error}</div>}
      {check.status === 'interrupted' && (
        <p className="text-sm text-muted-foreground">
          {t(
            'storeCheck.interruptedHint',
            'Its node restarted or stopped answering while it ran. What it found up to then is below; start a new check for the rest.',
          )}
        </p>
      )}

      {kinds.length > 0 && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {kinds.map(([kind, n, label]) => (
              <Badge key={kind} variant="outline">
                {label}: {number(n)}
              </Badge>
            ))}
            {check.problems.length > 0 && (
              <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowProblems((v) => !v)}>
                {showProblems
                  ? t('storeCheck.hideProblems', 'Hide the problems')
                  : t('storeCheck.showProblems', 'Show the problems')}
              </Button>
            )}
          </div>
          {showProblems && (
            <>
              <ProblemTable
                heads={[
                  t('storeCheck.col.kind', 'Problem'),
                  t('storeCheck.col.account', 'Account'),
                  t('storeCheck.col.object', 'What'),
                  t('storeCheck.col.blob', 'Blob'),
                  t('storeCheck.col.detail', 'Detail'),
                ]}
                rows={check.problems.map((p, i) => ({
                  key: `${p.blobId}-${p.objectId}-${i}`,
                  cells: [
                    kindLabel(t, p.kind),
                    p.accountName || p.accountId || '—',
                    `${objectLabel(t, p.object)} ${p.objectId}`,
                    <BlobId key="b" id={p.blobId} />,
                    [
                      p.detail,
                      p.kind === 'missing'
                        ? p.committed
                          ? t('storeCheck.committed', 'Was stored, then lost.')
                          : t('storeCheck.neverCommitted', 'Never finished being stored.')
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' '),
                  ],
                }))}
                kept={check.problems.length}
                total={found}
              />
              <ProblemHelp />
            </>
          )}
        </div>
      )}

      {confirming === 'stop' && (
        <Confirm
          title={t('storeCheck.stopTitle', 'Stop this check?')}
          body={t(
            'storeCheck.stopBody',
            'It stops at its next save, within about ten seconds. What it found so far is kept.',
          )}
          action={t('storeCheck.stop', 'Stop')}
          busy={busy}
          onConfirm={() => void act()}
          onClose={() => setConfirming(null)}
        />
      )}
      {confirming === 'delete' && (
        <Confirm
          title={t('storeCheck.deleteTitle', 'Delete this check?')}
          body={t('storeCheck.deleteBody', 'Its results are forgotten. The store isn’t touched.')}
          action={t('storeCheck.delete', 'Delete')}
          destructive
          busy={busy}
          onConfirm={() => void act()}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function ProblemHelp() {
  const { t } = useTranslation();
  return (
    <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
      <li>
        {t(
          'storeCheck.help.missing',
          'Missing: the blob store has nothing under that id. If the blob store setting was changed, look at Blob store changes first; otherwise restore the blob from a backup.',
        )}
      </li>
      <li>
        {t(
          'storeCheck.help.damaged',
          'Damaged: what’s stored isn’t what was written. Restore that blob from a backup taken before the damage.',
        )}
      </li>
      <li>
        {t(
          'storeCheck.help.unlinked',
          'Unlinked: a message names a blob but holds no link to it, so a cleanup could remove the blob. Back it up while it’s still there.',
        )}
      </li>
      <li>
        {t(
          'storeCheck.help.unreadable',
          'Unreadable: the blob store answered with an error. Check that the store is reachable and run the check again.',
        )}
      </li>
    </ul>
  );
}

function StartDialog({ onClose, onStarted }: { onClose: () => void; onStarted: () => void }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<CheckMode>('quick');
  const [blobs, setBlobs] = useState('');
  const [bytes, setBytes] = useState('');
  const { busy, run } = useAction();
  const blobsLimit = parseLimit(blobs);
  const bytesLimit = parseLimit(bytes);
  const invalid = blobsLimit === 'invalid' || bytesLimit === 'invalid';

  const start = async () => {
    if (invalid) return;
    const ok = await run(t('storeCheck.notStarted', 'The check didn’t start'), () =>
      startCheck(mode, blobsLimit, bytesLimit),
    );
    if (ok) {
      toast({ title: t('storeCheck.started', 'Check started') });
      onStarted();
    }
  };

  const choice = (value: CheckMode, title: string, body: string) => (
    <label
      className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${mode === value ? 'border-primary bg-primary/5' : ''}`}
    >
      <input type="radio" name="mode" className="mt-1" checked={mode === value} onChange={() => setMode(value)} />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="text-muted-foreground">{body}</span>
      </span>
    </label>
  );

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('storeCheck.startTitle', 'Check the store')}</DialogTitle>
          <DialogDescription>
            {t(
              'storeCheck.startBody',
              'It runs on the server, across every account; you can leave this page. One check runs at a time.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {choice(
            'quick',
            t('storeCheck.quick', 'Quick check'),
            t('storeCheck.quickBody', 'Every blob that something needs is in the blob store.'),
          )}
          {choice(
            'full',
            t('storeCheck.full', 'Full check'),
            t(
              'storeCheck.fullBody',
              'Also reads every blob back whole and checks its content against its id. Reads the whole store, so it takes longer.',
            ),
          )}
        </div>
        <LimitFields blobs={blobs} bytes={bytes} onBlobs={setBlobs} onBytes={setBytes} />
        {invalid && (
          <p className="text-sm text-destructive">{t('storeTools.limitInvalid', 'A limit is a whole number.')}</p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void start()} disabled={busy || invalid}>
            <Play className="mr-2 h-4 w-4" />
            {t('storeCheck.go', 'Start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
