/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import inbuxaMark from '@/assets/inbuxa-mark.png';

function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/** The dashboard's hello: whose server this is, and a nod to the time of day. */
export function Greeting() {
  const { t } = useTranslation();
  const accounts = useAuthStore((s) => s.accounts);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const full = (activeAccountId && accounts[activeAccountId]?.name) || '';
  const name = full.split('@')[0];
  const part = partOfDay(new Date().getHours());
  const hello =
    part === 'morning'
      ? t('greeting.morning', 'Good morning')
      : part === 'afternoon'
        ? t('greeting.afternoon', 'Good afternoon')
        : t('greeting.evening', 'Good evening');
  return (
    <div className="flex items-center gap-4 rounded-2xl border bg-gradient-to-br from-accent/70 via-card to-card px-5 py-4 shadow-soft">
      <img src={inbuxaMark} alt="" className="h-12 w-auto drop-shadow-sm" />
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-semibold">
          {hello}
          {name && `, ${name}`}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t('greeting.subtitle', "Here's how your mail server is doing.")}
        </p>
      </div>
    </div>
  );
}
