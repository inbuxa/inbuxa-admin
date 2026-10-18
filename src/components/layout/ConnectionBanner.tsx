/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: shown while the session can't be refreshed because the server
 * doesn't answer. The reader stays signed in and on the page; the refresh is
 * retried on its own, and here on request.
 */

import { useTranslation } from 'react-i18next';
import { WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { retryRefresh } from '@/services/api';
import { useConnectionStore } from '@/stores/connectionStore';

export function ConnectionBanner() {
  const { t } = useTranslation();
  const unreachable = useConnectionStore((s) => s.unreachable);

  if (!unreachable) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm"
    >
      <WifiOff className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <p className="min-w-0 flex-1">
        {t('connection.unreachable', "Can't reach the server. You're still signed in, and it keeps trying.")}
      </p>
      <Button size="sm" variant="outline" onClick={retryRefresh}>
        {t('connection.retry', 'Try now')}
      </Button>
    </div>
  );
}
