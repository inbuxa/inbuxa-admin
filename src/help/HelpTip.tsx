/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { ArrowUpRight, Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { manualUrl } from './manual';

/**
 * The ⓘ beside an option: a sentence or two on what it does, on hover or
 * focus, and a way into the manual once there is one. `id` is the option's
 * stable help id, the key the manual links hang on.
 */
export function HelpTip({ id, text, className }: { id?: string; text?: string | null; className?: string }) {
  const { t } = useTranslation();
  if (!text) return null;
  const more = id ? manualUrl(id) : null;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-help-id={id}
            aria-label={t('help.about', 'About this option')}
            className={cn(
              'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none',
              className,
            )}
          >
            <Info className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="start"
          className="max-w-xs space-y-1.5 border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-soft"
        >
          <div className="[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_p]:m-0">
            <ReactMarkdown>{text.replace(/\\n/g, '\n')}</ReactMarkdown>
          </div>
          {more && (
            <a
              href={more}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline"
            >
              {t('help.learnMore', 'Learn more')}
              <ArrowUpRight className="h-3 w-3" />
            </a>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
