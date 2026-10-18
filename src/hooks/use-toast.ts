/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The console's toasts: one list for the whole app, outside React, so any
 * module can raise a toast with `toast()`. `<Toaster />` shows the list.
 */
import { useSyncExternalStore, type ReactNode } from 'react';

/** At most this many show at once; the oldest goes first. */
const MAX_SHOWN = 5;
/** How long a toast stays up, unless it asks for longer (an Undo toast does). */
const DEFAULT_DURATION_MS = 5000;

type ToastVariant = 'default' | 'destructive' | 'success' | 'warning' | 'info';

interface ToastInput {
  title?: ReactNode;
  description?: ReactNode;
  variant?: ToastVariant;
  /** How long it stays up, in ms. */
  duration?: number;
}

interface ToasterToast extends ToastInput {
  id: string;
}

let shown: ToasterToast[] = [];
let lastId = 0;
const subscribers = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function publish(next: ToasterToast[]) {
  shown = next;
  for (const notify of subscribers) notify();
}

function clearTimer(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** Takes the toast down, or every toast when no id is given. */
function dismiss(id?: string) {
  if (id === undefined) {
    for (const t of shown) clearTimer(t.id);
    publish([]);
    return;
  }
  clearTimer(id);
  if (shown.some((t) => t.id === id)) publish(shown.filter((t) => t.id !== id));
}

/** Shows a toast, newest on top. The handle takes it down or changes it. */
function toast(input: ToastInput) {
  const id = String(++lastId);
  const kept = shown.slice(0, MAX_SHOWN - 1);
  for (const t of shown.slice(MAX_SHOWN - 1)) clearTimer(t.id);
  publish([{ ...input, id }, ...kept]);
  timers.set(
    id,
    setTimeout(() => dismiss(id), input.duration ?? DEFAULT_DURATION_MS),
  );
  return {
    id,
    dismiss: () => dismiss(id),
    update: (changes: ToastInput) => publish(shown.map((t) => (t.id === id ? { ...t, ...changes, id } : t))),
  };
}

function subscribe(notify: () => void) {
  subscribers.add(notify);
  return () => {
    subscribers.delete(notify);
  };
}

/** The toasts on screen, newest first. */
const currentToasts = () => shown;

/** The toasts on screen, with `toast` and `dismiss` for convenience. */
function useToast() {
  const toasts = useSyncExternalStore(subscribe, currentToasts, currentToasts);
  return { toasts, toast, dismiss };
}

export { useToast, toast, dismiss as dismissToast, currentToasts };
export type { ToasterToast, ToastVariant };
