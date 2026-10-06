/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState, type ReactNode } from 'react';
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
    jmapQueryAndGet('x:Account', getAccountId('x:Account'), { filter: { name: localPart } }, [
      'description',
      'emailAddress',
    ])
      .then((responses) => {
        const list =
          (responses[1]?.[1] as { list?: { description?: string | null; emailAddress?: string }[] }).list ?? [];
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

/**
 * The dashboard's hello: to whoever is signed in, with a nod to the time of
 * day, on a gridded band like a console's header. Whatever the page passes
 * in (status, clock, period) sits on the right.
 */
export function Greeting({ children }: { children?: ReactNode }) {
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
    <div className="relative overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div
        className="pointer-events-none absolute inset-0 opacity-60 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:24px_24px] [mask-image:linear-gradient(90deg,transparent,black_45%,black)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-primary/15 blur-3xl"
        aria-hidden
      />
      <div className="relative flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4">
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
        {children}
      </div>
    </div>
  );
}
