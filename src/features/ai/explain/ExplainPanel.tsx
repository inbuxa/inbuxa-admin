/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Check, Copy, Loader2, Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useExplainStore } from './explainStore';
import type { ExplainFailure, Explanation } from './explain';

/**
 * inbuxa: the explanation, beside the page rather than over it, so the
 * details it explains stay in view (EX-18 to EX-20). Mounted once.
 */
export function ExplainPanel() {
  const { t } = useTranslation();
  const panel = useExplainStore((s) => s.panel);
  const close = useExplainStore((s) => s.close);
  const retry = useExplainStore((s) => s.retry);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  useEffect(() => {
    if (panel.status === 'closed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panel.status, close]);

  if (panel.status === 'closed') return null;
  const copied = panel.status === 'done' && copiedText === panel.explanation.text;

  return (
    <aside
      role="complementary"
      aria-label={t('explain.panelLabel', 'Explanation')}
      className="fixed inset-x-0 bottom-0 z-40 flex max-h-[70vh] flex-col border-t bg-card shadow-soft sm:inset-x-auto sm:right-4 sm:bottom-4 sm:top-auto sm:w-[26rem] sm:rounded-xl sm:border"
    >
      <header className="flex items-start gap-2 border-b px-4 py-3">
        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{t('explain.title', 'Explanation')}</p>
          <p className="truncate text-xs text-muted-foreground" title={panel.title}>
            {panel.title}
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={close}
          aria-label={t('explain.close', 'Close')}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="overflow-y-auto px-4 py-3 text-sm" aria-live="polite">
        {panel.status === 'asking' && (
          <div className="space-y-3">
            {panel.soFar && <div className="whitespace-pre-line leading-relaxed">{panel.soFar}</div>}
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>
                {panel.soFar
                  ? t('explain.writing', 'Still writing…')
                  : t('explain.asking', 'Asking the local model…')}
              </span>
              <Button type="button" variant="ghost" size="sm" className="ml-auto h-7" onClick={close}>
                {t('explain.cancel', 'Cancel')}
              </Button>
            </div>
          </div>
        )}

        {panel.status === 'failed' && (
          <div className="space-y-3">
            <p className="text-muted-foreground">{failureText(t, panel.failure)}</p>
            {(panel.failure.kind === 'busy' || panel.failure.kind === 'timeout') && (
              <Button type="button" variant="outline" size="sm" className="h-7" onClick={retry}>
                {t('explain.retry', 'Try again')}
              </Button>
            )}
          </div>
        )}

        {panel.status === 'done' && (
          <div className="space-y-3">
            <div className="space-y-2 whitespace-pre-line leading-relaxed">{panel.explanation.text}</div>
            <p className="text-xs text-muted-foreground">{byline(t, panel.explanation)}</p>
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              {t(
                'explain.caution',
                "This is the local model's reading, and it can be wrong. Check it against the details shown.",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5"
              onClick={() =>
                void navigator.clipboard
                  .writeText(panel.explanation.text)
                  .then(() => setCopiedText(panel.explanation.text))
              }
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? t('explain.copied', 'Copied') : t('explain.copy', 'Copy')}
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}

/** Where the answer came from, in plain words (EX-27). */
function byline(t: TFunction, explanation: Explanation): string {
  switch (explanation.source) {
    case 'prepared':
      return t('explain.bylinePrepared', 'Prepared for release {{release}} with {{model}}', {
        release: explanation.preparedFor ?? '',
        model: explanation.model,
      });
    case 'remembered':
      return t('explain.bylineRemembered', 'Local AI · {{model}} · answered earlier on {{node}}', {
        model: explanation.model,
        node: explanation.node,
      });
    default:
      return t('explain.byline', 'Local AI · {{model}} · {{node}}', {
        model: explanation.model,
        node: explanation.node,
      });
  }
}

function failureText(t: TFunction, failure: ExplainFailure): string {
  switch (failure.kind) {
    case 'busy':
      return t('explain.busy', 'The model is busy with incoming mail. Try again in a moment.');
    case 'timeout':
      return t('explain.timeout', "The model didn't answer in time.");
    case 'paused':
      return t('explain.paused', 'The model is paused after repeated failures. It will be tried again shortly.');
    case 'rateLimit':
      return t('explain.rateLimit', "You've asked for as many explanations as this hour allows.");
    case 'unavailable':
      return t('explain.unavailable', 'No local model is available to explain this right now.');
    case 'refused':
      return failure.message;
  }
}
