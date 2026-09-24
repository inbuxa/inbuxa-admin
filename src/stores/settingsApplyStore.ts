/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: applies saved settings on the running server.
 *
 * Every registry write that needs it queues a reload action (see
 * lib/settingsApply). Once no write has been in flight for APPLY_DELAY_MS the
 * queued actions go out together in one x:Action/set, so a bulk edit, or a
 * page that saves several objects in a row, costs one reload rather than one
 * per object. A reload that fails stays queued and shows in
 * SettingsApplyBanner until it is applied, by "Apply now" or by the next save.
 *
 * If the server one day applies these writes by itself, the reload sent here
 * is a second, harmless one: one per burst of saves, never one per object.
 */

import { create } from 'zustand';
import i18n from '@/i18n';
import { toast } from '@/hooks/use-toast';
import { getAccountId, jmapRequest, setRegistryWriteListener } from '@/services/jmap/client';
import {
  RELOAD_ORDER,
  describeApplyFailure,
  describeRequestFailure,
  reloadActionsFor,
  type ApplyFailure,
  type ReloadAction,
} from '@/lib/settingsApply';
import type { JmapSetError } from '@/types/jmap';

export const APPLY_DELAY_MS = 600;

interface SettingsApplyState {
  /** Actions waiting to be sent: queued by saves, or left over from a failed attempt. */
  pending: ReloadAction[];
  applying: boolean;
  /** Why the last attempt didn't apply, until one does. */
  failure: ApplyFailure | null;
  /** Queues the actions the written types need, and applies them once writes settle. */
  noteWrites: (objectNames: string[]) => void;
  /** Sends whatever is queued now, without waiting. */
  applyNow: () => Promise<void>;
  /** Hides the failure. What failed stays queued for the next save. */
  dismiss: () => void;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let writesInFlight = 0;
let applyAgain = false;
// Whether a save has queued something since the last attempt. After a failed
// reload, only a save that needs one tries again by itself; editing an
// account, say, doesn't rerun a reload that is known to fail.
let freshlyQueued = false;

function merge(a: ReloadAction[], b: ReloadAction[]): ReloadAction[] {
  const all = new Set([...a, ...b]);
  return RELOAD_ORDER.filter((x) => all.has(x));
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  const { pending, failure } = useSettingsApplyStore.getState();
  if (pending.length === 0 || writesInFlight > 0) return;
  if (failure && !freshlyQueued) return;
  timer = setTimeout(() => {
    timer = null;
    void useSettingsApplyStore.getState().applyNow();
  }, APPLY_DELAY_MS);
}

export const useSettingsApplyStore = create<SettingsApplyState>()((set, get) => ({
  pending: [],
  applying: false,
  failure: null,

  noteWrites: (objectNames) => {
    const due = reloadActionsFor(objectNames);
    if (due.length > 0) {
      freshlyQueued = true;
      set({ pending: merge(get().pending, due) });
    }
    schedule();
  },

  applyNow: async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (get().applying) {
      // A save landed while the last reload was out: go again once it's back.
      applyAgain = true;
      return;
    }
    const actions = get().pending;
    if (actions.length === 0) return;

    freshlyQueued = false;
    set({ applying: true, pending: [] });
    let notApplied: ReloadAction[] = [];
    let failure: ApplyFailure | null = null;
    try {
      const create: Record<string, Record<string, unknown>> = {};
      actions.forEach((action, i) => {
        create[`reload-${i}`] = { '@type': action };
      });
      const responses = await jmapRequest([
        ['x:Action/set', { accountId: getAccountId('x:Action'), create }, 'reload'],
      ]);
      const [name, result] = responses[responses.length - 1] ?? [];
      if (name !== 'x:Action/set' || !result) {
        notApplied = actions;
        failure = describeRequestFailure(result);
      } else {
        const created = (result.created ?? {}) as Record<string, unknown>;
        const notCreated = (result.notCreated ?? {}) as Record<string, JmapSetError>;
        for (const [i, action] of actions.entries()) {
          const key = `reload-${i}`;
          if (key in created) continue;
          notApplied.push(action);
          failure ??= notCreated[key]
            ? describeApplyFailure(notCreated[key])
            : { message: i18n.t('settingsApply.notConfirmed', 'The server did not confirm the reload.') };
        }
      }
    } catch (err) {
      notApplied = actions;
      failure = describeRequestFailure(err);
    }

    set({ applying: false, pending: merge(get().pending, notApplied), failure });
    if (!failure) {
      toast({ title: i18n.t('settingsApply.applied', 'Saved and applied'), variant: 'success' });
    }

    if (applyAgain) {
      applyAgain = false;
      schedule();
    }
  },

  dismiss: () => set({ failure: null }),
}));

setRegistryWriteListener({
  started() {
    writesInFlight++;
    if (timer) clearTimeout(timer);
    timer = null;
  },
  finished(objectNames) {
    writesInFlight = Math.max(0, writesInFlight - 1);
    useSettingsApplyStore.getState().noteWrites(objectNames);
  },
});

/** Test hook: forget timers and counters between cases. */
export function resetSettingsApplyForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  writesInFlight = 0;
  applyAgain = false;
  freshlyQueued = false;
  useSettingsApplyStore.setState({ pending: [], applying: false, failure: null });
}
