/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: "Your first domain" (admin UX roadmap, item 12): a short hello from
 * the cat and the two things to do next. The domain's own page carries the
 * DNS setup, with its "Guided or manual?" choice, so this only leads there.
 */

import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSchemaStore } from '@/stores/schemaStore';
import inbuxaMark from '@/assets/inbuxa-mark.png';
import { useFirstDomain } from './firstDomain';

export function FirstDomainCelebration() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const domain = useFirstDomain((s) => s.domain);
  const close = useFirstDomain((s) => s.close);
  const go = (path: string) => {
    close();
    navigate(path);
  };

  return (
    <Dialog open={domain !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md text-center">
        <img src={inbuxaMark} alt="" className="mx-auto h-20 w-auto animate-in zoom-in-50 fade-in duration-500" />
        <DialogHeader className="items-center sm:text-center">
          <DialogTitle className="font-display text-xl">
            {t('firstDomain.title', 'Your first domain is in')}
          </DialogTitle>
          <DialogDescription>
            {t(
              'firstDomain.body',
              '{{name}} is on the server. Once its DNS records are published, mail for it starts arriving here.',
              { name: domain?.name ?? '' },
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button
            type="button"
            onClick={() => domain && go(`/${viewToSection['x:Domain'] ?? 'Management'}/x:Domain/${domain.id}`)}
          >
            {t('firstDomain.dns', 'Set up its DNS')}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => go(`/${viewToSection['x:Account/User'] ?? 'Management'}/x:Account/User/new`)}
          >
            <UserPlus className="mr-1.5 h-4 w-4" />
            {t('firstDomain.person', 'Add the first person')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
