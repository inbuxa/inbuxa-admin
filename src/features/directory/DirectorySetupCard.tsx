/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Fingerprint } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaunchChoice } from '@/components/wizard/LaunchChoice';
import { useSchemaStore } from '@/stores/schemaStore';
import { cn } from '@/lib/utils';

export const DIRECTORY_WIZARD_VIEW = 'Wizard/directory';

/** "Guided or manual?" for connecting a directory. Manual opens Directories unless told otherwise. */
export function DirectoryLaunchChoice({
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
  const section = useSchemaStore((s) => s.viewToSection['x:Directory']) ?? 'Settings';
  return (
    <LaunchChoice
      open={open}
      onOpenChange={onOpenChange}
      title={t('dirCard.chooseTitle', 'Connect a sign-in directory')}
      guidedHint={t(
        'dirCard.guidedHint',
        'Pick your directory, fill in the connection, test a person, then choose domains. Nothing moves until the test passes.',
      )}
      manualHint={t('dirCard.manualHint', 'Create the directory and set each domain’s directory yourself.')}
      onGuided={() => navigate(`/${section}/${DIRECTORY_WIZARD_VIEW}`)}
      onManual={onManual ?? (() => navigate(`/${section}/x:Directory`))}
    />
  );
}

/**
 * inbuxa: at the top of Directories and Authentication, an invitation to
 * connect a directory with the guide (settings-reorg, first wave). Manual
 * stays on the page.
 */
export function DirectorySetupCard({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4',
        className,
      )}
    >
      <Fingerprint className="h-5 w-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{t('dirCard.title', 'Sign in with accounts you already have')}</p>
        <p className="text-sm text-muted-foreground">
          {t(
            'dirCard.hint',
            'A guide connects Active Directory, LDAP or an OpenID Connect provider, tests a real person, then moves the domains you pick.',
          )}
        </p>
      </div>
      <Button type="button" onClick={() => setOpen(true)}>
        {t('dirCard.start', 'Set it up')}
      </Button>
      <DirectoryLaunchChoice open={open} onOpenChange={setOpen} onManual={() => undefined} />
    </div>
  );
}
