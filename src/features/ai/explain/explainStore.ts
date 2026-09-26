/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: whether Explain is offered (the session's `aiExplain`), and the one
 * explanation panel. Asking again replaces what the panel shows; a request
 * left behind is abandoned in the console (EX-19), and the server finishes
 * or times out on its own.
 */

import { create } from 'zustand';
import { requestExplanation, type ExplainFailure, type ExplainSubject, type Explanation } from './explain';

type PanelState =
  | { status: 'closed' }
  | { status: 'asking'; title: string; subject: ExplainSubject }
  | { status: 'done'; title: string; subject: ExplainSubject; explanation: Explanation }
  | { status: 'failed'; title: string; subject: ExplainSubject; failure: ExplainFailure };

interface ExplainState {
  available: boolean;
  panel: PanelState;
  setAvailable: (available: boolean) => void;
  ask: (subject: ExplainSubject, title: string) => void;
  retry: () => void;
  close: () => void;
}

let controller: AbortController | null = null;

export const useExplainStore = create<ExplainState>()((set, get) => ({
  available: false,
  panel: { status: 'closed' },

  setAvailable: (available) => set({ available }),

  ask: (subject, title) => {
    controller?.abort();
    const mine = new AbortController();
    controller = mine;
    set({ panel: { status: 'asking', title, subject } });
    requestExplanation(subject, mine.signal)
      .then((result) => {
        if (controller !== mine) return;
        set({
          panel: result.ok
            ? { status: 'done', title, subject, explanation: result.explanation }
            : { status: 'failed', title, subject, failure: result.failure },
        });
      })
      .catch((err: unknown) => {
        if (controller !== mine || mine.signal.aborted) return;
        set({
          panel: {
            status: 'failed',
            title,
            subject,
            failure: { kind: 'refused', message: err instanceof Error ? err.message : String(err) },
          },
        });
      });
  },

  retry: () => {
    const panel = get().panel;
    if (panel.status !== 'closed') get().ask(panel.subject, panel.title);
  },

  close: () => {
    controller?.abort();
    controller = null;
    set({ panel: { status: 'closed' } });
  },
}));
