/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { ListChecks, SlidersHorizontal } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * "Guided or manual?" Every job that has a wizard asks this each time it
 * starts. Nothing is remembered: the wizard is always opt-in.
 */
export function LaunchChoice({
  open,
  onOpenChange,
  title,
  guidedHint,
  manualHint,
  onGuided,
  onManual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  guidedHint: string;
  manualHint?: string;
  onGuided: () => void;
  onManual: () => void;
}) {
  const { t } = useTranslation();
  const option = (
    icon: typeof ListChecks,
    heading: string,
    hint: string,
    onClick: () => void,
    accent: boolean,
    autoFocus: boolean,
  ) => {
    const Icon = icon;
    return (
      <button
        type="button"
        autoFocus={autoFocus}
        onClick={() => {
          onOpenChange(false);
          onClick();
        }}
        className={cn(
          'group flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all',
          'hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          accent ? 'border-primary/40 bg-primary/5' : 'border-border bg-card',
        )}
      >
        <span
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-xl',
            accent ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <span className="font-medium">{heading}</span>
        <span className="text-sm text-muted-foreground">{hint}</span>
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{t('wizard.chooseHow', 'How would you like to do this?')}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          {option(ListChecks, t('wizard.guided', 'Guide me'), guidedHint, onGuided, true, true)}
          {option(
            SlidersHorizontal,
            t('wizard.manual', "I'll do it myself"),
            manualHint ?? t('wizard.manualHint', 'The full form, with every option at once.'),
            onManual,
            false,
            false,
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
