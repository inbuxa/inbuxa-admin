/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: "Send test" on a saved webhook (settings-reorg, Webhooks). The
 * server sends one sample event, of type webhook.test, the way it sends a
 * real batch, and says what came back (POST /api/webhook/test).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Loader2, Send, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/services/api';
import { describeTestAnswer, type WebhookTestAnswer } from './webhookTest';

export function WebhookTestCard({ webhookId }: { webhookId: string }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<WebhookTestAnswer | null>(null);

  const send = async () => {
    setBusy(true);
    setAnswer(null);
    try {
      const res = await apiFetch('/api/webhook/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookId }),
      });
      if (!res.ok) {
        const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
        throw new Error(problem.detail ?? problem.title ?? `The test failed (${res.status}).`);
      }
      setAnswer((await res.json()) as WebhookTestAnswer);
    } catch (e) {
      setAnswer({ sent: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Send className="h-5 w-5 text-primary" />
        <div className="flex-1">
          <p className="font-medium">{t('webhookTest.title', 'Send a test event')}</p>
          <p className="text-sm text-muted-foreground">
            {t(
              'webhookTest.body',
              'One sample event of type webhook.test, sent with the saved settings, even while the webhook is off. Save changes first to test them.',
            )}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void send()} disabled={busy}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
          {t('webhookTest.send', 'Send test')}
        </Button>
      </div>
      {answer && (
        <p
          role="status"
          className={`flex items-start gap-2 text-sm ${answer.sent ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}
        >
          {answer.sent ? (
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          {describeTestAnswer(answer)}
        </p>
      )}
    </div>
  );
}
