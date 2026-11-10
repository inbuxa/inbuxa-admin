/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the banner while a blob store change is unresolved (BM-3), on
 * every page for whoever can act on it, and the note on the blob store
 * settings that changing them moves nothing (BM-1).
 */

import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRightLeft, Info } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { fetchChanges } from './api';
import { isUnresolved } from './model';

export const BLOB_STORE_CHANGES_VIEW = 'CustomComponent/BlobStoreChanges';
const CHANGES_HREF = `/Settings/${BLOB_STORE_CHANGES_VIEW}`;
/** A change only appears when a node restarts, so there's no hurry to notice. */
const LOOK_AGAIN_MS = 5 * 60_000;

export function BlobStoreChangeBanner() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const canAct = useAccountStore((s) => s.hasPermission('sysBlobStoreChange'));
  const [unresolved, setUnresolved] = useState(0);
  const onChangesPage = pathname.endsWith(BLOB_STORE_CHANGES_VIEW);

  useEffect(() => {
    if (!canAct) return;
    const controller = new AbortController();
    const look = () =>
      fetchChanges(controller.signal)
        .then((changes) => {
          if (!controller.signal.aborted) setUnresolved(changes.filter(isUnresolved).length);
        })
        // An older server, or a moment offline: say nothing.
        .catch(() => undefined);
    void look();
    const timer = setInterval(() => void look(), LOOK_AGAIN_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
    // Leaving the changes page looks again, so a copy finished or a change dismissed there shows at once.
  }, [canAct, onChangesPage]);

  if (!canAct || !unresolved || onChangesPage) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm"
    >
      <ArrowRightLeft className="h-4 w-4 shrink-0 text-amber-600" />
      <span className="min-w-0 flex-1">
        {t(
          'blobStoreChange.banner',
          'The blob store setting changed, and older mail is still read from the old store. Copy it over so the old store can go.',
        )}
      </span>
      <Link to={CHANGES_HREF} className="font-medium text-primary hover:underline">
        {t('blobStoreChange.bannerLink', 'Blob store changes')}
      </Link>
    </div>
  );
}

export function BlobStoreSettingsNote() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex max-w-4xl gap-3 rounded-xl border bg-muted/30 px-4 py-3 text-sm">
      <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="space-y-1">
        <p>
          {t(
            'blobStoreChange.settingsNote',
            'Changing where blobs are kept moves nothing. Messages, attachments and files already stored stay in the old store until you copy them.',
          )}
        </p>
        <p className="text-muted-foreground">
          {t(
            'blobStoreChange.settingsNoteAfter',
            'Once every node restarts with the new setting, the server reads what it can’t find from the old store, and you copy the rest from',
          )}{' '}
          <Link to={CHANGES_HREF} className="font-medium text-primary hover:underline">
            {t('blobStoreChange.bannerLink', 'Blob store changes')}
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
