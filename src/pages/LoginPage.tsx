/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ArrowRight, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

import Logo from '@/components/common/Logo';
import { SourceLink } from '@/components/common/SourceLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { startAuthFlow } from '@/services/auth/oauth';
import { clearReturnPath, readReturnPath } from '@/services/auth/session';

/**
 * Goes straight on to the server's own sign-in page, which asks for the
 * username and password; the console talks to one server, so there is no
 * account to look up first. The card shows only while that is on its way,
 * or when getting there failed, with a button to try again.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const { state } = useLocation();
  // The page to come back to: from the route guard, or kept when the server ended the session (endSession).
  const comeBackTo = (state as { from?: string } | null)?.from ?? readReturnPath();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const started = useRef(false);
  useDocumentTitle(t('login.title', 'Sign in'));

  const signIn = useCallback(async () => {
    setError(null);
    setBusy(true);
    try {
      await startAuthFlow(null, comeBackTo);
      // The sign-in round trip carries it from here.
      clearReturnPath();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.error', 'An unexpected error occurred'));
      setBusy(false);
    }
  }, [comeBackTo, t]);

  useEffect(() => {
    // Once, though StrictMode runs effects twice.
    if (started.current) return;
    started.current = true;
    void signIn();
  }, [signIn]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-content-background px-4">
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="items-center text-center">
          <Logo />
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="button" className="w-full" disabled={busy} onClick={() => void signIn()}>
            {busy ? (
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
