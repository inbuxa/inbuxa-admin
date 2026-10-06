/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/common/PageHeader';
import { cn } from '@/lib/utils';

export interface WizardStep {
  id: string;
  title: string;
}

/**
 * The frame every guided job shares: where you are in it, the step itself,
 * a side panel saying what this step does (and how to undo it, for the big
 * jobs), and the way forward or back. The steps own their content and decide
 * when "Next" is allowed; the shell never does anything on its own.
 */
export function WizardShell({
  icon,
  title,
  subtitle,
  steps,
  current,
  children,
  aside,
  canNext = true,
  busy = false,
  nextLabel,
  onBack,
  onNext,
  onCancel,
  hideFooter = false,
}: {
  icon: string;
  title: ReactNode;
  subtitle?: ReactNode;
  steps: WizardStep[];
  current: number;
  children: ReactNode;
  aside?: ReactNode;
  canNext?: boolean;
  busy?: boolean;
  nextLabel?: string;
  onBack?: () => void;
  onNext?: () => void;
  onCancel: () => void;
  hideFooter?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        icon={icon}
        title={title}
        subtitle={subtitle}
        actions={
          <Button variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4" />
            {t('wizard.close', 'Close')}
          </Button>
        }
      />

      <ol className="flex flex-wrap items-center gap-x-2 gap-y-3" aria-label={t('wizard.progress', 'Progress')}>
        {steps.map((s, i) => {
          const done = i < current;
          const here = i === current;
          return (
            <li key={s.id} className="flex items-center gap-2" aria-current={here ? 'step' : undefined}>
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  done && 'bg-primary text-primary-foreground',
                  here && 'bg-primary/15 text-primary ring-2 ring-primary',
                  !done && !here && 'bg-muted text-muted-foreground',
                )}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className={cn('text-sm', here ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {s.title}
              </span>
              {i < steps.length - 1 && <span className="mx-1 hidden h-px w-8 bg-border sm:block" aria-hidden />}
            </li>
          );
        })}
      </ol>

      <div className={cn('grid items-start gap-6', aside && 'lg:grid-cols-[minmax(0,1fr)_18rem]')}>
        <Card>
          <CardContent className="space-y-6 pt-6">{children}</CardContent>
        </Card>
        {aside && <aside className="space-y-4 text-sm">{aside}</aside>}
      </div>

      {!hideFooter && (
        <div className="flex items-center justify-between">
          {onBack ? (
            <Button variant="ghost" onClick={onBack} disabled={busy}>
              <ArrowLeft className="h-4 w-4" />
              {t('wizard.back', 'Back')}
            </Button>
          ) : (
            <span />
          )}
          {onNext && (
            <Button onClick={onNext} disabled={!canNext || busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {nextLabel ?? t('wizard.next', 'Next')}
              {!busy && <ArrowRight className="h-4 w-4" />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

/** A side-panel note: what this step does, or how to undo it. */
export function WizardNote({
  title,
  children,
  tone = 'plain',
}: {
  title: string;
  children: ReactNode;
  tone?: 'plain' | 'undo';
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-4',
        tone === 'undo' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-border bg-card',
      )}
    >
      <p className="mb-1.5 font-medium">{title}</p>
      <div className="space-y-2 text-muted-foreground">{children}</div>
    </div>
  );
}
