/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Delete without "Are you sure?" (admin UX roadmap, item 9). The
 * objects vanish at once, a toast offers Undo, and the delete is sent when
 * the toast's time is up. A delete the server refuses brings the objects
 * back with the reason.
 */

import i18n from '@/i18n';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { friendlySetError } from '@/lib/jmapErrors';
import {
  flushPendingDeletes,
  heldCount,
  scheduleDelete,
  UNDO_MS,
  type DeleteResult,
  type Scheduled,
} from '@/lib/pendingDeletes';
import { getAccountId, jmapSet } from '@/services/jmap/client';
import { useAuthStore } from '@/stores/authStore';
import type { JmapSetError, JmapSetResponse } from '@/types/jmap';

/** Sends the delete in batches the server accepts. */
async function commit(objectName: string, ids: string[]): Promise<DeleteResult> {
  const accountId = getAccountId(objectName);
  const batchSize = Math.max(1, useAuthStore.getState().maxObjectsInSet || ids.length);
  const destroyed: string[] = [];
  const errors: Record<string, JmapSetError> = {};
  for (let i = 0; i < ids.length; i += batchSize) {
    const batch = ids.slice(i, i + batchSize);
    const responses = await jmapSet(objectName, accountId, { destroy: batch });
    const entry = responses.find(([name]) => name === `${objectName}/set`);
    if (!entry) {
      const r = responses[0]?.[1] as { type?: string; description?: string } | undefined;
      const error: JmapSetError = { type: r?.type ?? 'serverFail', description: r?.description };
      for (const id of batch) errors[id] = error;
      continue;
    }
    const resp = entry[1] as unknown as JmapSetResponse;
    destroyed.push(...(resp.destroyed ?? []));
    Object.assign(errors, resp.notDestroyed ?? {});
    for (const id of batch) {
      if (!destroyed.includes(id) && !errors[id]) {
        errors[id] = {
          type: 'notConfirmed',
          description: i18n.t(
            'list.deleteNotConfirmed',
            'Delete failed: item was not confirmed as destroyed by the server.',
          ),
        };
      }
    }
  }
  return { destroyed, errors };
}

function reportFailures(errors: Record<string, JmapSetError>) {
  const list = Object.values(errors);
  if (list.length === 0) return;
  const reasons = [...new Set(list.map((e) => friendlySetError(e)))];
  toast({
    variant: 'destructive',
    title: i18n.t('undoDelete.failed', {
      count: list.length,
      defaultValue_one: 'Not deleted',
      defaultValue_other: '{{count}} not deleted',
    }),
    description: reasons.join(' '),
  });
}

export interface UndoableDelete {
  objectName: string;
  ids: string[];
  /** What was deleted, in words: "the domain example.org", "3 accounts". */
  what: string;
  /** Runs once the server has deleted at least one of them. */
  onDeleted?: (result: DeleteResult) => void;
}

/** Hides the objects, offers Undo for UNDO_MS, then deletes them. */
export function deleteWithUndo({ objectName, ids, what, onDeleted }: UndoableDelete): Scheduled {
  const scheduled = scheduleDelete(objectName, ids, commit);
  const { dismiss } = toast({
    title: i18n.t('undoDelete.deleted', 'Deleted {{what}}', { what }),
    duration: UNDO_MS,
    description: (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="mt-1"
        onClick={() => {
          scheduled.undo();
          dismiss();
        }}
      >
        {i18n.t('undoDelete.undo', 'Undo')}
      </Button>
    ),
  });
  void scheduled.settled.then((result) => {
    if (!result) return;
    reportFailures(result.errors);
    if (result.destroyed.length > 0) onDeleted?.(result);
  });
  return scheduled;
}

// Leaving the page sends whatever is still waiting, and asks the browser to
// hold on while it goes, so a delete is neither lost nor done silently later.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (heldCount() === 0) return;
    void flushPendingDeletes();
    e.preventDefault();
  });
}
