/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import { ArrowUpRight, Info } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { manualUrl } from './manual';

const HOVER_OPEN_MS = 150;
const HOVER_CLOSE_MS = 200;

/**
 * The ⓘ beside an option: a sentence or two on what it does, and a way into
 * the manual once there is one. `id` is the option's stable help id, the key
 * the manual links hang on.
 *
 * A toggletip, not a tooltip: a tap or click opens it and another closes it,
 * as do Escape and a tap outside, so it works on a phone, where a tooltip
 * never opens on a tap (#179). With a mouse it also opens on hover, and
 * stays open while the pointer is over it, so its link can be reached.
 */
export function HelpTip({
  id,
  text,
  footnote,
  className,
}: {
  id?: string;
  text?: string | null;
  /** A short line under the text, like the option's default. */
  footnote?: string | null;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // Opened by hovering, it closes when the pointer leaves; opened by a
  // click or tap, it stays until dismissed
  const byHover = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!text && !footnote) return null;
  const more = id ? manualUrl(id) : null;

  const later = (ms: number, then: () => void) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(then, ms);
  };
  const hoverIn = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (open) {
      clearTimeout(timer.current);
      return;
    }
    later(HOVER_OPEN_MS, () => {
      byHover.current = true;
      setOpen(true);
    });
  };
  const hoverOut = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    if (!open) {
      clearTimeout(timer.current);
    } else if (byHover.current) {
      later(HOVER_CLOSE_MS, () => setOpen(false));
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearTimeout(timer.current);
        byHover.current = false;
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          data-help-id={id}
          aria-label={t('help.about', 'About this option')}
          onPointerEnter={hoverIn}
          onPointerLeave={hoverOut}
          onClick={(event) => {
            // A click on a tip that hovering opened keeps it open
            if (open && byHover.current) {
              event.preventDefault();
              clearTimeout(timer.current);
              byHover.current = false;
            }
          }}
          className={cn(
            'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 transition-colors hover:text-primary focus-visible:text-primary focus-visible:outline-none data-[state=open]:text-primary',
            className,
          )}
        >
          <Info className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        sideOffset={6}
        onPointerEnter={hoverIn}
        onPointerLeave={hoverOut}
        // Hovering mustn't pull focus away from what's being typed in
        onOpenAutoFocus={(event) => event.preventDefault()}
        className="w-auto max-w-xs space-y-1.5 border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-soft"
      >
        <div className="[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_p]:m-0">
          {text && <ReactMarkdown>{text.replace(/\\n/g, '\n')}</ReactMarkdown>}
        </div>
        {footnote && <p className="text-muted-foreground">{footnote}</p>}
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
      </PopoverContent>
    </Popover>
  );
}
