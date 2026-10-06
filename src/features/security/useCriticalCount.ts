/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: how many critical security items are on the to-do list and not
 * accepted, for the dashboard's status line (SS-27). Only for those who may
 * see the Security page; null until known, or when it can't be.
 */

import { useEffect, useState } from 'react';
import { useSchemaStore } from '@/stores/schemaStore';
import { useAccountStore } from '@/stores/accountStore';
import { evaluate } from './checks';
import { loadSnapshot } from './load';
import { fetchAcceptances, sortOut } from './acceptances';

export function useCriticalCount(): number | null {
  const schema = useSchemaStore((s) => s.schema);
  const allowed = useAccountStore((s) => s.hasObjectPermission('sysSecurity', 'Get'));
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!allowed || !schema) return;
    let live = true;
    const controller = new AbortController();
    Promise.all([loadSnapshot(controller.signal, true), fetchAcceptances().catch(() => [])])
      .then(([snapshot, acceptances]) => {
        const { items } = evaluate(snapshot, (o, f) => schema.fields[o]?.defaults?.[f]);
        const critical = items.filter((i) => i.severity === 'critical');
        if (live) setCount(sortOut(critical, acceptances).todo.length);
      })
      .catch(() => undefined);
    return () => {
      live = false;
      controller.abort();
    };
  }, [allowed, schema]);

  return allowed ? count : null;
}
