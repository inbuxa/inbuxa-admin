/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useExplainStore } from './explainStore';
import type { ExplainSubject } from './explain';

/**
 * inbuxa: asks the local model to explain `subject` in the side panel
 * (EX-17). Drawn only when the session says Explain is available; `icon`
 * is the small form for help tips and table rows.
 */
export function ExplainButton({
  subject,
  title,
  icon = false,
  className,
}: {
  subject: ExplainSubject | (() => ExplainSubject);
  /** What the panel is about, e.g. the recipient or the setting's label. */
  title: string;
  icon?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const available = useExplainStore((s) => s.available);
  const ask = useExplainStore((s) => s.ask);
  if (!available) return null;
  const label = t('explain.button', 'Explain');
  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    ask(typeof subject === 'function' ? subject() : subject, title);
  };
  if (icon) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={t('explain.buttonAbout', 'Explain {{what}}', { what: title })}
        title={label}
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none',
          className,
        )}
      >
        <Sparkles className="h-3.5 w-3.5" />
      </button>
    );
  }
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} className={cn('h-7 gap-1.5 px-2', className)}>
      <Sparkles className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
