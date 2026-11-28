/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the one-time "count this server?" question on Settings › Overview.
 * A card, not a modal, shown only while the server says it hasn't been
 * answered (`decided` false). Both answers are the same size and style, and
 * the exact body sent is one link away. Either answer is saved on the server,
 * so the question never comes back. A server without the setting, or an
 * account that can't change it, sees nothing.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { resolveViewPath } from '@/lib/navTree';
import { SETTINGS_LAYOUT_NAME } from '@/lib/settingsLayout';
import { useAccountStore } from '@/stores/accountStore';
import { CountExplanation } from './CountExplanation';
import {
  COUNT_NO,
  COUNT_YES,
  fetchCountSettings,
  SERVER_COUNT_VIEW,
  updateCountSettings,
  type CountSettingsUpdate,
} from './countSettings';

export function CountQuestionCard() {
  const { t } = useTranslation();
  const canAnswer = useAccountStore((s) => s.hasPermission('sysTracerGet') && s.hasPermission('sysTracerUpdate'));
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState<'yes' | 'no' | null>(null);

  useEffect(() => {
    if (!canAnswer) return;
    const ctl = new AbortController();
    fetchCountSettings(ctl.signal)
      .then((s) => !ctl.signal.aborted && setAsking(!s.decided))
      // An older server has no such setting: ask nothing
      .catch(() => {});
    return () => ctl.abort();
  }, [canAnswer]);

  if (!asking) return null;

  const answer = async (which: 'yes' | 'no', update: CountSettingsUpdate) => {
    setBusy(which);
    try {
      await updateCountSettings(update);
      setAsking(false);
      toast({
        title:
          which === 'yes'
            ? t('countQuestion.thanks', 'Thank you. You can turn this off at any time on Server count.')
            : t('countQuestion.declined', 'This server will not be counted. You can change that on Server count.'),
      });
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('countQuestion.failed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-labelledby="count-question-title">
      <h2 id="count-question-title" className="font-medium">
        {t('countQuestion.title', 'Help count inbuxa servers?')}
      </h2>
      <CountExplanation />
      <Link
        to={resolveViewPath(SETTINGS_LAYOUT_NAME, SERVER_COUNT_VIEW)}
        className="inline-block text-sm underline underline-offset-4"
      >
        {t('countQuestion.seeWhat', 'See exactly what’s sent')}
      </Link>
      <div className="flex flex-wrap gap-2">
        {/* The same variant and size for both: neither answer is the one to pick. */}
        <Button variant="outline" disabled={busy !== null} onClick={() => void answer('yes', COUNT_YES)}>
          {busy === 'yes' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('countQuestion.yes', 'Count this server')}
        </Button>
        <Button variant="outline" disabled={busy !== null} onClick={() => void answer('no', COUNT_NO)}>
          {busy === 'no' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('countQuestion.no', 'No thanks')}
        </Button>
      </div>
    </section>
  );
}
