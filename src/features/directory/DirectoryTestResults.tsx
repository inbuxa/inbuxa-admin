/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** inbuxa: what a directory test found, line by line (guided setup and admin #109). */

import { useTranslation } from 'react-i18next';
import { CheckCircle2, XCircle } from 'lucide-react';
import type { DirectoryTestResult } from './directoryTest';

export function TestLine({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
      ) : (
        <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      )}
      {children}
    </li>
  );
}

export function DirectoryTestResults({ result: r }: { result: DirectoryTestResult }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-2 text-sm">
      <TestLine ok={r.opened}>
        {r.opened
          ? r.oidc
            ? t('dirSetup.oidcOk', 'The provider answered, as {{issuer}}.', { issuer: r.oidc.issuer })
            : t('dirSetup.opened', 'The server can use this directory.')
          : t('dirSetup.notOpened', 'The directory didn’t open: {{error}}', { error: r.error ?? '' })}
      </TestLine>
      {r.lookup && (
        <TestLine ok={r.lookup.found === 'account'}>
          <span>
            {r.lookup.error
              ? t('dirSetup.lookupError', 'The lookup failed: {{error}}', { error: r.lookup.error })
              : r.lookup.found === 'account'
                ? t('dirSetup.found', 'Found {{name}} <{{email}}>.', {
                    name: r.lookup.description ?? '',
                    email: r.lookup.email,
                  })
                : r.lookup.found === 'group'
                  ? t('dirSetup.foundGroup', 'That address is a group, not a person. Try a person’s address.')
                  : t(
                      'dirSetup.notFound',
                      'Nobody with that address. Check the search base and that the address is in the mail attribute.',
                    )}
            {r.lookup.found === 'account' && (r.lookup.aliases?.length || r.lookup.groups?.length) ? (
              <span className="block text-xs text-muted-foreground">
                {r.lookup.aliases?.length
                  ? t('dirSetup.aliases', 'Also receives: {{list}}. ', { list: r.lookup.aliases.join(', ') })
                  : ''}
                {r.lookup.groups?.length
                  ? t('dirSetup.groups', 'Groups: {{list}}.', { list: r.lookup.groups.join(', ') })
                  : ''}
              </span>
            ) : null}
          </span>
        </TestLine>
      )}
      {r.signIn && (
        <TestLine ok={r.signIn.ok}>
          {r.signIn.ok
            ? t('dirSetup.signInOk', 'The password signs in.')
            : r.signIn.wrongPassword
              ? t('dirSetup.wrongPassword', 'The directory says that password is wrong.')
              : t('dirSetup.signInError', 'Signing in failed: {{error}}', { error: r.signIn.error ?? '' })}
        </TestLine>
      )}
    </ul>
  );
}
