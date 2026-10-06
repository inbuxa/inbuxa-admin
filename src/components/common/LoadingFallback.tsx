/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import inbuxaMark from '@/assets/inbuxa-mark.png';

export function LoadingFallback({ fullScreen = false }: { fullScreen?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3', fullScreen ? 'min-h-screen' : 'p-8')}>
      <img src={inbuxaMark} alt="" className="h-12 w-auto animate-bounce [animation-duration:1.4s]" />
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        {t('common.loading')}
      </p>
    </div>
  );
}
