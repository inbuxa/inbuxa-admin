/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { useDocumentTitle } from '@/hooks/useDocumentTitle';

/** A path no route matches. */
export default function NotFound() {
  const { t } = useTranslation();
  const message = t('errors.notFound');
  useDocumentTitle(message);
  return (
    <main className="flex min-h-screen flex-col items-center justify-center text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="mt-2 text-muted-foreground">{message}</p>
      <Link to="/" className="mt-4 text-primary underline hover:no-underline">
        {t('common.back')}
      </Link>
    </main>
  );
}
