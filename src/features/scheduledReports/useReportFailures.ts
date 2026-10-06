/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: how many scheduled reports failed their last two runs, for the
 * dashboard's Needs attention (scheduled-reports spec, RP-17). Only for
 * whoever may see the reports; null until known, or on an older server.
 */

import { useEffect, useState } from 'react';
import { useAccountStore } from '@/stores/accountStore';
import { fetchReports } from './api';
import { isFailing } from './describe';

export function useReportFailures(tick: number): number | null {
  const allowed = useAccountStore((s) => s.hasObjectPermission('sysScheduledReport', 'Get'));
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    fetchReports()
      .then((reports) => live && setCount(reports.filter(isFailing).length))
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [allowed, tick]);

  return allowed ? count : null;
}
