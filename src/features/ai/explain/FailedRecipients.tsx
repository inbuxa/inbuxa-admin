/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExplainButton } from './ExplainButton';
import { useExplainStore } from './explainStore';
import { failedRecipients } from './explain';

/**
 * inbuxa: a queued message's failed recipients, each with Explain (EX-17).
 * Shown above the message's form, and only when there is something to
 * explain and a model to explain it.
 */
export function FailedRecipients({ queueId, recipients }: { queueId: string; recipients: unknown }) {
  const { t } = useTranslation();
  const available = useExplainStore((s) => s.available);
  const failed = failedRecipients(recipients);
  if (!available || failed.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('explain.failedRecipients', 'Failed deliveries')}</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="divide-y">
          {failed.map((rcpt) => (
            <li key={rcpt.address} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{rcpt.address}</p>
                <p className="truncate text-xs text-muted-foreground" title={rcpt.summary}>
                  {rcpt.status === 'PermanentFailure'
                    ? t('explain.permanent', 'Permanent failure')
                    : t('explain.temporary', 'Temporary failure')}
                  {rcpt.summary && ` · ${rcpt.summary}`}
                </p>
              </div>
              <ExplainButton
                subject={{ '@type': 'DeliveryFailure', queueId, recipient: rcpt.address }}
                title={rcpt.address}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
