/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Calls `refresh` every `minutes`, skipping a beat while the page is out of
 * sight (nobody is watching, and the page catches up on the next one).
 * Returns the way to stop. Zero minutes is off.
 */
export function startAutoRefresh(
  minutes: number,
  refresh: () => void,
  hidden: () => boolean = () => document.hidden,
): () => void {
  if (!minutes) return () => {};
  const timer = setInterval(() => {
    if (!hidden()) refresh();
  }, minutes * 60_000);
  return () => clearInterval(timer);
}
