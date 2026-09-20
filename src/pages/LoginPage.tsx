/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Loader2 } from 'lucide-react';

import Logo from '@/components/common/Logo';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { startAuthFlow } from '@/services/auth/oauth';
import { SourceLink } from '@/components/common/SourceLink';

/**
 * INBUXA: straight to the server's own sign-in page, which asks for the
 * username and password. There is no account-name step first: INBUXA Admin
 * talks to one known server, so there is nothing to look up per account (see
 * `discover`). The card stays only for when getting there fails.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const location = useLocation();
  const originalPath = (location.state as { from?: string } | null)?.from ?? null;
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const started = useRef(false);

  useDocumentTitle(t('login.title', 'Sign in'));

  const go = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      await startAuthFlow(null, originalPath);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error', 'An unexpected error occurred'));
      setLoading(false);
    }
  }, [originalPath, t]);

  useEffect(() => {
    // Once, even under StrictMode's double effect.
    if (started.current) return;
    started.current = true;
    void go();
  }, [go]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-content-background px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          <Logo />
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <Button type="button" className="w-full" disabled={loading} onClick={() => void go()}>
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                {t('login.continue', 'Continue')}
                <ArrowRight />
              </>
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <SourceLink className="underline underline-offset-2 hover:text-foreground" />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
