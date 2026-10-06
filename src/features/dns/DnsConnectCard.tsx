/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaunchChoice } from '@/components/wizard/LaunchChoice';
import { useSchemaStore } from '@/stores/schemaStore';

/**
 * At the top of a domain's DNS section: an invitation to have the server
 * publish the records itself. It asks "guided or manual?" every time; manual
 * closes the question and leaves you at the DNS Management field just below.
 */
export function DnsConnectCard({ domainId, automatic }: { domainId: string; automatic: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const section = useSchemaStore((s) => s.viewToSection['x:Domain']) ?? 'Management';
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
        {automatic ? <CheckCircle2 className="h-5 w-5" /> : <Wand2 className="h-5 w-5" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {automatic
            ? t('dnsCard.autoTitle', 'The server keeps this domain’s DNS up to date')
            : t('dnsCard.title', 'Let the server publish your DNS records')}
        </p>
        <p className="text-sm text-muted-foreground">
          {automatic
            ? t('dnsCard.autoHint', 'See which records are live, or change what it publishes.')
            : t(
                'dnsCard.hint',
                'Connect your DNS host, such as Cloudflare, and skip copying records by hand. Optional.',
              )}
        </p>
      </div>
      <Button type="button" variant={automatic ? 'outline' : 'default'} onClick={() => setOpen(true)}>
        {automatic ? t('dnsCard.review', 'Check records') : t('dnsCard.start', 'Set it up')}
      </Button>
      <LaunchChoice
        open={open}
        onOpenChange={setOpen}
        title={t('dnsCard.chooseTitle', 'Automatic DNS')}
        guidedHint={t(
          'dnsCard.guidedHint',
          'Pick your DNS host, paste a key, choose records, and watch them go live. About two minutes.',
        )}
        manualHint={t('dnsCard.manualHint', 'Use the DNS Management setting below, with every option at once.')}
        onGuided={() => navigate(`/${section}/Wizard/dns/${domainId}`)}
        onManual={() => undefined}
      />
    </div>
  );
}
