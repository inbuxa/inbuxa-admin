/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { getBasePath } from '@/lib/basePath';
import { finishSignIn } from '@/services/auth/callback';
import { claimCode, settleCode } from '@/services/auth/codeOnce';
import { useAuthStore } from '@/stores/authStore';

/** Where the server sends the browser after sign-in: trades the code, then goes on to the console. */
export default function OAuthCallback() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  useDocumentTitle(t('oauth.title', 'Signing in'));

  useEffect(() => {
    // Each code is traded once (codeOnce.ts): the effect can run twice, and a
    // reload brings a spent code back.
    const code = params.get('code');
    const claim = code ? claimCode(code) : 'trade';
    if (claim === 'inFlight') return;
    if (claim === 'traded') {
      navigate(useAuthStore.getState().isAuthenticated() ? '/' : '/login', { replace: true });
      return;
    }
    let traded = false;
    finishSignIn(params)
      .then((to) => {
        traded = true;
        navigate(to, { replace: true });
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : t('oauth.error', 'Authentication failed')))
      .finally(() => {
        if (code) settleCode(code, traded);
      });
  }, [navigate, params, t]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      {error ? (
        <div className="w-full max-w-sm space-y-4 text-center">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <a href={`${getBasePath()}/login`} className="text-sm text-primary underline-offset-4 hover:underline">
            {t('oauth.backToLogin', 'Back to login')}
          </a>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{t('oauth.processing', 'Completing sign in...')}</p>
        </div>
      )}
    </div>
  );
}
