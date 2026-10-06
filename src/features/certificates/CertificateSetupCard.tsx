/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaunchChoice } from '@/components/wizard/LaunchChoice';
import { useSchemaStore } from '@/stores/schemaStore';
import { cn } from '@/lib/utils';

export const CERTIFICATE_WIZARD_VIEW = 'Wizard/certificates';

/** "Guided or manual?" for automatic certificates. Manual opens the domains, where the setting lives. */
export function CertificateLaunchChoice({
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
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const section = viewToSection['x:Certificate'] ?? 'Settings';
  return (
    <LaunchChoice
      open={open}
      onOpenChange={onOpenChange}
      title={t('certCard.chooseTitle', 'Certificates, automatically')}
      guidedHint={t(
        'certCard.guidedHint',
        'Pick domains, check every name first, and watch Let’s Encrypt certificates arrive. About two minutes.',
      )}
      manualHint={t(
        'certCard.manualHint',
        'Add an ACME provider, then set each domain’s Certificate management yourself.',
      )}
      onGuided={() => navigate(`/${section}/${CERTIFICATE_WIZARD_VIEW}`)}
      onManual={onManual ?? (() => navigate(`/${viewToSection['x:Domain'] ?? 'Management'}/x:Domain`))}
    />
  );
}

/** inbuxa: at the top of Certificates and ACME providers (settings-reorg, guided setup 2). */
export function CertificateSetupCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4',
        className,
      )}
    >
      <ShieldCheck className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('certCard.title', 'Free certificates that renew themselves')}</p>
        <p className="text-sm text-muted-foreground">
          {t(
            'certCard.hint',
            'A guide checks your domains’ names and sets up Let’s Encrypt, so certificates are issued and renewed for you.',
          )}
        </p>
      </div>
      <Button type="button" onClick={() => setOpen(true)}>
        {t('certCard.start', 'Set it up')}
      </Button>
      <CertificateLaunchChoice open={open} onOpenChange={setOpen} onManual={() => undefined} />
    </div>
  );
}
