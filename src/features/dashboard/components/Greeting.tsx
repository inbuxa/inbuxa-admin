/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { getAccountId, jmapQueryAndGet } from '@/services/jmap/client';
import inbuxaMark from '@/assets/inbuxa-mark.png';

function partOfDay(hour: number): 'morning' | 'afternoon' | 'evening' {
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  return 'evening';
}

/**
 * The name to greet: the account's full name where it has one, otherwise the
 * name it signs in with. Looked up by the local part and matched on the whole
 * address, so an account of the same name on another domain can't answer.
 */
function useFullName(username: string | null): string | null {
  const [fullName, setFullName] = useState<string | null>(null);
  useEffect(() => {
    if (!username) return;
    let live = true;
    const localPart = username.split('@')[0];
    jmapQueryAndGet('x:Account', getAccountId('x:Account'), { filter: { name: localPart } }, ['description', 'emailAddress'])
      .then((responses) => {
        const list = (responses[1]?.[1] as { list?: { description?: string | null; emailAddress?: string }[] }).list ?? [];
        const own = list.find((a) => a.emailAddress?.toLowerCase() === username.toLowerCase());
        const name = own?.description?.trim();
        if (live && name) setFullName(name);
      })
      .catch(() => {
        /* the sign-in name stands */
      });
    return () => {
      live = false;
    };
  }, [username]);
  return fullName;
}

/** The dashboard's hello: to whoever is signed in, with a nod to the time of day. */
export function Greeting() {
  const { t } = useTranslation();
  const username = useAuthStore((s) => s.username);
  const fullName = useFullName(username);
  const name = fullName ?? username?.split('@')[0] ?? '';
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
        <p className="truncate text-sm text-muted-foreground">
          {username && (
            <>
              {t('greeting.signedInAs', 'Signed in as {{username}}', { username })}
              {' · '}
            </>
          )}
          {t('greeting.subtitle', "Here's how your mail server is doing.")}
        </p>
      </div>
    </div>
  );
}
