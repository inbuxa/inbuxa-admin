/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** The second half of signing in: what /oauth/callback does with the server's answer. */
import i18n from '@/i18n';
import { getBasePath } from '@/lib/basePath';
import { useAuthStore } from '@/stores/authStore';

import { clearStoredOAuthData, exchangeCode, getOAuthRedirectUri, getStoredOAuthData } from './oauth';

/** A path inside the console, without its base, and never a sign-in page (those land on '/'). */
export function landingPath(returnUrl: string | null): string {
  const base = getBasePath();
  let path = returnUrl || '/';
  if (base && path.startsWith(base)) path = path.slice(base.length) || '/';
  const isSignInPage = ['/login', '/oauth/callback'].some((p) => path === p || path.startsWith(`${p}?`));
  return isSignInPage ? '/' : path;
}

/**
 * Checks the callback's parameters against the sign-in this browser started,
 * trades the code for tokens and keeps them, and returns where to go next.
 * Throws, with a message for the reader, when the server reported an error,
 * a parameter is missing, the state doesn't match (a callback this browser
 * didn't ask for), or the sign-in data is gone. Either way, the sign-in data
 * is cleared: a code and verifier are good for one try.
 */
export async function finishSignIn(params: URLSearchParams): Promise<string> {
  const t = i18n.t.bind(i18n);
  try {
    const failure = params.get('error');
    if (failure) throw new Error(params.get('error_description') || failure);

    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) throw new Error(t('oauth.missingParams', 'Missing authorization code or state parameter'));

    const kept = getStoredOAuthData();
    if (!kept.state || kept.state !== state) {
      throw new Error(t('oauth.stateMismatch', 'State parameter mismatch. Please try logging in again.'));
    }
    if (!kept.codeVerifier || !kept.tokenEndpoint) {
      throw new Error(t('oauth.missingData', 'Missing OAuth session data. Please try logging in again.'));
    }

    const tokens = await exchangeCode(code, kept.codeVerifier, kept.tokenEndpoint, getOAuthRedirectUri());
    useAuthStore
      .getState()
      .setTokens(
        tokens.access_token,
        tokens.refresh_token,
        tokens.expires_in,
        kept.tokenEndpoint,
        kept.endSessionEndpoint,
      );
    return landingPath(kept.returnUrl);
  } finally {
    clearStoredOAuthData();
  }
}
