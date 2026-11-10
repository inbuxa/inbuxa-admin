/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Storage › Snapshots (inbuxa-server
 * docs/spec/features/store-snapshot.md). Take a snapshot, see the ones kept
 * on disk, and see why one was refused or failed.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Copy, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { formatSize } from '@/lib/durationFormat';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { deleteSnapshot, fetchSnapshots, takeSnapshot } from './api';
import { newestFirst, type StoreSnapshot } from './model';
import { Confirm, Empty, Facts } from './parts';
import { number, useAction, usePolledList, when } from './hooks';

const running = (snapshots: StoreSnapshot[]) => snapshots.some((s) => s.status === 'running');

export function StoreSnapshotsPage() {
  const { t } = useTranslation();
  const canSnapshot = useAccountStore((s) => s.hasPermission('sysStoreSnapshot'));
  const { load, refetch } = usePolledList(
    fetchSnapshots,
    running,
    t(
      'storeSnapshot.unavailable',
      'This server can’t take snapshots. It needs inbuxa 27.1-rc.16 or 2026.11.9.1 or newer.',
    ),
  );
  const [taking, setTaking] = useState(false);
  // A refusal (another data store, a blob store change not settled) stays on the page until the next try.
  const [refusal, setRefusal] = useState<string | null>(null);
  const snapshots = load.kind === 'ready' ? newestFirst(load.items, (s) => s.createdAt) : [];

  const take = async () => {
    setRefusal(null);
    setTaking(true);
    try {
      await takeSnapshot();
      toast({ title: t('storeSnapshot.started', 'Snapshot started') });
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : String(e));
    } finally {
      setTaking(false);
      refetch();
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="camera"
        title={t('storeSnapshot.title', 'Snapshots')}
        subtitle={t(
          'storeSnapshot.subtitle',
          'A copy of the whole store at one moment, taken without stopping the server, for a backup tool to pick up. The latest two are kept.',
        )}
        actions={
          canSnapshot && load.kind === 'ready' ? (
            <Button onClick={() => void take()} disabled={taking || running(load.items)}>
              <Camera className="mr-2 h-4 w-4" />
              {t('storeSnapshot.take', 'Take a snapshot')}
            </Button>
          ) : undefined
        }
      />

      {refusal && (
        <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm">
          <div className="font-medium">{t('storeSnapshot.notTaken', 'The snapshot wasn’t taken')}</div>
          <div className="text-muted-foreground">{refusal}</div>
        </div>
      )}

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && <Empty>{load.message}</Empty>}
      {load.kind === 'ready' && snapshots.length === 0 && (
        <Empty>{t('storeSnapshot.none', 'There are no snapshots on disk.')}</Empty>
      )}
      {snapshots.map((snapshot) => (
        <SnapshotCard key={snapshot.id} snapshot={snapshot} canAct={canSnapshot} onChanged={refetch} />
      ))}

      <div className="space-y-2 rounded-xl border bg-muted/30 p-4 text-sm">
        <div className="font-medium">{t('storeSnapshot.aboutTitle', 'What a snapshot holds')}</div>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            {t(
              'storeSnapshot.about.where',
              'It goes under snapshots/ in the RocksDB directory, named for when it was taken, with snapshots/latest pointing at the newest. Point your backup tool there, and leave snapshots/ out of any copy of the store itself.',
            )}
          </li>
          <li>
            {t(
              'storeSnapshot.about.stores',
              'It needs RocksDB as the data store, with blobs in it or in a filesystem blob store. With PostgreSQL, MySQL or FoundationDB, use the database’s own backup.',
            )}
          </li>
          <li>
            {t(
              'storeSnapshot.about.left',
              'Not in it: a search index kept outside the store (reindex after a restore) and the in-memory store.',
            )}
          </li>
          <li>
            {t(
              'storeSnapshot.about.restore',
              'To restore, stop the server, move the store’s files aside (keep snapshots/), copy the snapshot’s data/ (and blobs/) in, and start it. The steps are also in each snapshot’s snapshot.json.',
            )}
          </li>
        </ul>
      </div>
    </div>
  );
}

function SnapshotCard({
  snapshot,
  canAct,
  onChanged,
}: {
  snapshot: StoreSnapshot;
  canAct: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [confirming, setConfirming] = useState(false);

  const remove = async () => {
    if (await run(t('storeSnapshot.deleteFailed', 'The snapshot wasn’t deleted'), () => deleteSnapshot(snapshot.id))) {
      setConfirming(false);
      onChanged();
    }
  };

  const copyPath = () => {
    void navigator.clipboard?.writeText(snapshot.path).then(
      () => toast({ title: t('storeSnapshot.pathCopied', 'Path copied') }),
      () => undefined,
    );
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span className="font-mono">{snapshot.name || snapshot.id}</span>
            {snapshot.status === 'running' && <Badge variant="outline">{t('storeSnapshot.running', 'Taking')}</Badge>}
            {snapshot.status === 'done' && <Badge variant="secondary">{t('storeSnapshot.done', 'Complete')}</Badge>}
            {snapshot.status === 'failed' && <Badge variant="destructive">{t('storeSnapshot.failed', 'Failed')}</Badge>}
          </div>
          <div className="text-sm text-muted-foreground">
            {t('storeSnapshot.takenBy', 'Taken {{when}} by {{who}} on node {{node}}', {
              when: when(snapshot.createdAt),
              who: snapshot.createdBy,
              node: snapshot.node,
            })}
          </div>
          {snapshot.path && (
            <div className="flex min-w-0 items-center gap-1 text-sm">
              <code className="truncate font-mono text-xs">{snapshot.path}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={copyPath}
                aria-label={t('storeSnapshot.copyPath', 'Copy the path')}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
        {canAct && snapshot.status !== 'running' && (
          <Button variant="outline" size="sm" onClick={() => setConfirming(true)}>
            <Trash2 className="mr-2 h-4 w-4" />
            {t('storeSnapshot.delete', 'Delete')}
          </Button>
        )}
      </div>

      {snapshot.status === 'done' && (
        <Facts
          items={[
            [
              t('storeSnapshot.holds', 'Holds'),
              snapshot.holds
                .map((h) =>
                  h === 'data'
                    ? t('storeSnapshot.holdsData', 'data store')
                    : h === 'blobs'
                      ? t('storeSnapshot.holdsBlobs', 'blob files')
                      : h,
                )
                .join(', '),
            ],
            [t('storeSnapshot.size', 'Size'), formatSize(snapshot.size)],
            ...(snapshot.holds.includes('blobs')
              ? ([[t('storeSnapshot.blobFiles', 'Blob files'), number(snapshot.blobFiles)]] as [string, string][])
              : []),
            [t('storeSnapshot.finished', 'Finished'), when(snapshot.finishedAt)],
          ]}
        />
      )}
      {snapshot.status === 'failed' && snapshot.error && (
        <div className="text-sm text-destructive">{snapshot.error}</div>
      )}

      {confirming && (
        <Confirm
          title={t('storeSnapshot.deleteTitle', 'Delete {{name}}?', { name: snapshot.name || snapshot.id })}
          body={t(
            'storeSnapshot.deleteBody',
            'Its directory is deleted from the server. A backup that already copied it keeps its copy.',
          )}
          action={t('storeSnapshot.delete', 'Delete')}
          destructive
          busy={busy}
          onConfirm={() => void remove()}
          onClose={() => setConfirming(false)}
        />
      )}
    </div>
  );
}
