/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: applies saved settings on the running server.
 *
 * A newer server applies a registry write itself and says how it went in the
 * set response (`x:settingsReload`); the admin only reports that. An older
 * server doesn't, so every write there that needs it queues a reload action
 * (see lib/settingsApply). Once no write has been in flight for APPLY_DELAY_MS
 * the queued actions go out together in one x:Action/set, so a bulk edit, or
 * a page that saves several objects in a row, costs one reload rather than
 * one per object.
 *
 * Either way a burst of saves ends in one result: a "Saved and applied" toast,
 * or SettingsApplyBanner with why the settings weren't applied. What wasn't
 * applied stays queued until it is, by "Apply now", by the next save that
 * needs the same reload, or by the server applying a later write of that kind.
 */

import { create } from 'zustand';
import i18n from '@/i18n';
import { toast } from '@/hooks/use-toast';
import { getAccountId, jmapRequest, setRegistryWriteListener } from '@/services/jmap/client';
import {
  RELOAD_ORDER,
  describeApplyFailure,
  describeRequestFailure,
  describeServerReload,
  reloadActionFor,
  serverAppliesWrite,
  type ApplyFailure,
  type RegistryWrite,
  type ReloadAction,
} from '@/lib/settingsApply';
import type { JmapSetError } from '@/types/jmap';

export const APPLY_DELAY_MS = 600;

interface SettingsApplyState {
  /** Actions not known to be applied: queued by saves, or left over from a failed attempt. */
  pending: ReloadAction[];
  applying: boolean;
  /** Why the last attempt didn't apply, until one does. */
  failure: ApplyFailure | null;
  /** Takes note of registry writes: what the server applied, and what the admin has to. */
  noteWrites: (writes: RegistryWrite[]) => void;
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
// What the server reported for the writes since the burst last settled: that
// it applied a settings object, and the reloads it couldn't apply (the last
// word per action).
let serverReported = false;
let serverApplied = false;
const serverFailures = new Map<ReloadAction, ApplyFailure>();

function merge(a: ReloadAction[], b: ReloadAction[]): ReloadAction[] {
  const all = new Set([...a, ...b]);
  return RELOAD_ORDER.filter((x) => all.has(x));
}

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  if (writesInFlight > 0) return;
  const { pending, failure } = useSettingsApplyStore.getState();
  const send = pending.length > 0 && (freshlyQueued || (!failure && serverFailures.size === 0));
  if (!send && !serverReported) return;
  timer = setTimeout(() => {
    timer = null;
    settle();
  }, APPLY_DELAY_MS);
}

/** Ends a burst of saves: sends what the admin has to, or reports what the server did. */
function settle() {
  const store = useSettingsApplyStore.getState();
  if (store.applying) {
    // Report once the reload that is out comes back.
    applyAgain = true;
    return;
  }
  const serverFailure = [...serverFailures.values()].pop() ?? null;
  const announce = serverApplied;
  serverReported = false;
  serverApplied = false;
  serverFailures.clear();

  if (serverFailure) useSettingsApplyStore.setState({ failure: serverFailure });
  const { pending, failure } = useSettingsApplyStore.getState();
  if (pending.length > 0 && (freshlyQueued || !failure)) {
    // An older server's writes, or a reload a dismissed failure left queued:
    // the admin's reload speaks for the whole burst.
    void store.applyNow();
    return;
  }
  if (announce && !failure) {
    toast({ title: i18n.t('settingsApply.applied', 'Saved and applied'), variant: 'success' });
  }
}

export const useSettingsApplyStore = create<SettingsApplyState>()((set, get) => ({
  pending: [],
  applying: false,
  failure: null,

  noteWrites: (writes) => {
    let pending = get().pending;
    for (const write of writes) {
      const own = reloadActionFor(write.objectName);
      if (write.serverReload && serverAppliesWrite(write)) {
        // The server has applied this write, or tried to: nothing to send.
        // A type the admin sends nothing for, a directory say, was a full reload.
        const action = own ?? 'ReloadSettings';
        serverReported = true;
        if (write.serverReload.applied) {
          serverFailures.delete(action);
          pending = pending.filter((a) => a !== action);
          // Only settings objects say "Saved and applied"; the rest have their form's toast.
          if (own) serverApplied = true;
        } else {
          serverFailures.set(action, describeServerReload(write.serverReload));
          pending = merge(pending, [action]);
        }
      } else if (own) {
        // An older server: the admin applies it.
        freshlyQueued = true;
        pending = merge(pending, [own]);
      }
    }
    if (pending.length === 0) {
      // The server has applied everything queued, and whatever failed before.
      freshlyQueued = false;
      set({ pending, failure: null });
    } else {
      set({ pending });
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
    // This reload comes after every write so far, so it has the last word on
    // what the server said about them.
    for (const action of actions) serverFailures.delete(action);
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
      serverApplied = false;
      toast({ title: i18n.t('settingsApply.applied', 'Saved and applied'), variant: 'success' });
    }

    if (applyAgain || serverReported) {
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
  finished(writes) {
    writesInFlight = Math.max(0, writesInFlight - 1);
    useSettingsApplyStore.getState().noteWrites(writes);
  },
});

/** Test hook: forget timers and counters between cases. */
export function resetSettingsApplyForTests() {
  if (timer) clearTimeout(timer);
  timer = null;
  writesInFlight = 0;
  applyAgain = false;
  freshlyQueued = false;
  serverReported = false;
  serverApplied = false;
  serverFailures.clear();
  useSettingsApplyStore.setState({ pending: [], applying: false, failure: null });
}
