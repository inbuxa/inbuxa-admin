/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Monitoring › Webhooks, with what the server sends above the list
 * (settings-reorg, second wave): the body's shape, how the signature works,
 * and a way to see one arrive.
 */

import { useTranslation } from 'react-i18next';
import { Webhook } from 'lucide-react';
import { DynamicList } from '@/components/lists/DynamicList';
import { EXAMPLE_BODY } from './eventGroups';

export function WebhooksPage({ viewName }: { viewName: string }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-xl border bg-card p-4">
        <div className="flex items-center gap-3">
          <Webhook className="h-5 w-5 text-primary" />
          <p className="font-medium">{t('webhooks.title', 'What a webhook receives')}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {t(
            'webhooks.body',
            'A POST with a JSON body holding one or more of the events you chose, batched at most once per throttle interval:',
          )}
        </p>
        <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">{EXAMPLE_BODY}</pre>
        <p className="text-sm text-muted-foreground">
          {t(
            'webhooks.signature',
            'With a signature key set, each request carries X-Signature: the HMAC-SHA256 of the raw body under that key, in base64. Compute it on your side and compare before trusting the request.',
          )}
        </p>
        <p className="text-sm text-muted-foreground">
          {t(
            'webhooks.try',
            'To see one arrive, choose “Failed sign-ins and bans” and sign in once with a wrong password. Failed deliveries are retried until “Discard after”.',
          )}
        </p>
      </div>
      <DynamicList viewName={viewName} />
    </div>
  );
}
