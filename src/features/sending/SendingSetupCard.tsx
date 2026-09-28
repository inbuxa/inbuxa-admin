/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaunchChoice } from '@/components/wizard/LaunchChoice';
import { useSchemaStore } from '@/stores/schemaStore';
import { cn } from '@/lib/utils';

export const SENDING_WIZARD_VIEW = 'Wizard/sending';

/** "Guided or manual?" for the sending setup. Manual opens the delivery strategy unless told otherwise. */
export function SendingLaunchChoice({
  open,
  onOpenChange,
  onManual,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onManual?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const section = useSchemaStore((s) => s.viewToSection['x:MtaOutboundStrategy']) ?? 'Settings';
  return (
    <LaunchChoice
      open={open}
      onOpenChange={onOpenChange}
      title={t('sendingCard.chooseTitle', 'How this server sends mail')}
      guidedHint={t(
        'sendingCard.guidedHint',
        'Check port 25, choose direct delivery or a relay service, and see exactly what changes. About three minutes.',
      )}
      manualHint={t('sendingCard.manualHint', 'Edit the delivery strategy and routes yourself, with every option.')}
      onGuided={() => navigate(`/${section}/${SENDING_WIZARD_VIEW}`)}
      onManual={onManual ?? (() => navigate(`/${section}/x:MtaOutboundStrategy`))}
    />
  );
}

/**
 * inbuxa: at the top of Delivery strategy and Routes, an invitation to set up
 * sending with the guide (settings-reorg, guided setup 1).
 */
export function SendingSetupCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4',
        className,
      )}
    >
      <Send className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('sendingCard.title', 'Direct delivery or a relay?')}</p>
        <p className="text-sm text-muted-foreground">
          {t(
            'sendingCard.hint',
            'A guide checks whether port 25 is open and sets up Amazon SES, Mailgun, SendGrid or another relay for you.',
          )}
        </p>
      </div>
      <Button type="button" onClick={() => setOpen(true)}>
        {t('sendingCard.start', 'Set it up')}
      </Button>
      <SendingLaunchChoice open={open} onOpenChange={setOpen} onManual={() => undefined} />
    </div>
  );
}
