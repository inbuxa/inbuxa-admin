/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Undo instead of "Are you sure?" (admin UX roadmap, item 9). A
 * delete is held here for UNDO_MS before it reaches the server, so Undo
 * only has to forget it: nothing is re-created, and nothing is lost that a
 * re-create couldn't bring back (secrets, ids, history). While a delete is
 * held its objects are hidden from lists.
 */

import { create } from 'zustand';
import type { JmapSetError } from '@/types/jmap';

/** How long Undo is offered before the delete is sent. */
export const UNDO_MS = 8_000;

export interface DeleteResult {
  destroyed: string[];
  errors: Record<string, JmapSetError>;
}

/** Sends the delete. Injected so the hold-and-release logic can be tested without a server. */
export type Commit = (objectName: string, ids: string[]) => Promise<DeleteResult>;

interface State {
  /** objectName → ids waiting to be deleted. */
  pending: Record<string, string[]>;
  /** objectName → bumped whenever its pending set changes or a delete lands, so lists reload. */
  versions: Record<string, number>;
}

export const usePendingDeletes = create<State>(() => ({ pending: {}, versions: {} }));

function change(objectName: string, update: (ids: string[]) => string[]) {
  usePendingDeletes.setState((s) => ({
    pending: { ...s.pending, [objectName]: update(s.pending[objectName] ?? []) },
    versions: { ...s.versions, [objectName]: (s.versions[objectName] ?? 0) + 1 },
  }));
}

/** Whether this object is waiting to be deleted, so a list should leave it out. */
export function isPendingDelete(objectName: string, id: string): boolean {
  return usePendingDeletes.getState().pending[objectName]?.includes(id) ?? false;
}

interface Held {
  objectName: string;
  ids: string[];
  timer: ReturnType<typeof setTimeout>;
  run: () => Promise<DeleteResult>;
}

const held = new Set<Held>();

export interface Scheduled {
  /** Forgets the delete, if it hasn't been sent yet. Returns whether it was in time. */
  undo: () => boolean;
  /** Resolves once the delete was sent (with what happened) or undone (null). */
  settled: Promise<DeleteResult | null>;
}

/** Holds a delete for `delayMs`, then sends it with `commit`. */
export function scheduleDelete(
  objectName: string,
  ids: string[],
  commit: Commit,
  delayMs: number = UNDO_MS,
): Scheduled {
  let resolve!: (r: DeleteResult | null) => void;
  const settled = new Promise<DeleteResult | null>((r) => (resolve = r));
  change(objectName, (pending) => [...pending, ...ids.filter((id) => !pending.includes(id))]);

  const release = () => change(objectName, (pending) => pending.filter((id) => !ids.includes(id)));

  const entry: Held = {
    objectName,
    ids,
    timer: setTimeout(() => void entry.run(), delayMs),
    run: async () => {
      held.delete(entry);
      clearTimeout(entry.timer);
      let result: DeleteResult;
      try {
        result = await commit(objectName, ids);
      } catch (e) {
        const error: JmapSetError = { type: 'serverFail', description: e instanceof Error ? e.message : String(e) };
        result = { destroyed: [], errors: Object.fromEntries(ids.map((id) => [id, error])) };
      }
      release();
      resolve(result);
      return result;
    },
  };
  held.add(entry);

  return {
    undo: () => {
      if (!held.has(entry)) return false;
      held.delete(entry);
      clearTimeout(entry.timer);
      release();
      resolve(null);
      return true;
    },
    settled,
  };
}

/** How many deletes are waiting. */
export function heldCount(): number {
  return held.size;
}

/** Sends every waiting delete now (leaving the page, signing out). */
export function flushPendingDeletes(): Promise<DeleteResult[]> {
  return Promise.all([...held].map((h) => h.run()));
}
