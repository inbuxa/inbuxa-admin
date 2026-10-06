/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: how many blocklist and reverse-DNS failures the deliverability
 * reports hold, for the dashboard's Needs attention (deliverability spec,
 * DL-18). Only for whoever may read the reports; null until known, or when
 * it can't be (an older server).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAccountStore } from '@/stores/accountStore';
import { fetchReports, fetchSettings } from './api';
import { alarms, grade } from './grade';

export function useDeliverabilityAlarms(tick: number): number | null {
  const { t } = useTranslation();
  const allowed = useAccountStore((s) => s.hasObjectPermission('sysDeliverability', 'Get'));
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed) return;
    let live = true;
    Promise.all([fetchReports(), fetchSettings()])
      .then(([reports, settings]) => {
        if (live) setCount(alarms(grade(reports, settings.lists, (k, d, o) => t(k, d, o))).length);
      })
      .catch(() => live && setCount(null));
    return () => {
      live = false;
    };
  }, [allowed, tick, t]);

  return allowed ? count : null;
}
