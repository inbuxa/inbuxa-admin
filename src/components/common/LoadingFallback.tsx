/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import inbuxaMark from '@/assets/inbuxa-mark.png';
import { cn } from '@/lib/utils';

/** The bouncing cat and "Loading…", in a page's place or filling the screen. */
export function LoadingFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', fullScreen ? 'min-h-screen' : 'p-8')}>
      <img src={inbuxaMark} alt="" className="h-12 w-auto animate-bounce [animation-duration:1.4s]" />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        {t('common.loading')}
      </p>
    </div>
  );
}
