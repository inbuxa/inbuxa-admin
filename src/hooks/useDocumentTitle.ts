/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect } from 'react';

const APP = 'inbuxa Admin';

/** Titles the browser tab "Page · inbuxa Admin" while the page is shown. */
export function useDocumentTitle(title?: string | null): void {
  useEffect(() => {
    document.title = title ? `${title} · ${APP}` : APP;
    return () => {
      document.title = APP;
    };
  }, [title]);
}
