/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: on a person's account page, the legal holds covering it, by any
 * route (audit-hold-lock spec, LH-14). Shown only to those who may see
 * holds; everyone else, the account's owner included, sees nothing.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Scale } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { fetchHoldsOn, HOLD_CHANGED, type LegalHold } from './legalHold';

export function HeldNotice({ accountId }: { accountId: string }) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasPermission('sysLegalHoldGet'));
  const [holds, setHolds] = useState<LegalHold[]>([]);
  const [fetches, setFetches] = useState(0);

  useEffect(() => {
    const refetch = () => setFetches((n) => n + 1);
    window.addEventListener(HOLD_CHANGED, refetch);
    return () => window.removeEventListener(HOLD_CHANGED, refetch);
  }, []);

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    fetchHoldsOn(accountId, controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setHolds(list);
      })
      // An older server without holds: say nothing
      .catch(() => undefined);
    return () => controller.abort();
  }, [accountId, canGet, fetches]);

  if (!canGet || holds.length === 0) return null;
  return (
    <div className="flex items-start gap-3 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
      <Scale className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
      <div className="space-y-1">
        <p className="font-medium">
          {t('hold.heldTitle', 'Held: nothing in this account can be destroyed, and deleting it keeps its data.')}
        </p>
        <p className="text-muted-foreground">
          {holds.map((h) => (h.reference ? `${h.name} (${h.reference})` : h.name)).join(', ')}
        </p>
      </div>
    </div>
  );
}
