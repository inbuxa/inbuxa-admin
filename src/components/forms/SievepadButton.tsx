/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useTranslation } from 'react-i18next';
import { Bug } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { openInSievepad } from '@/lib/sievepad';
import type { SieveInterpreter } from '@/lib/sieveLimits';

interface SievepadButtonProps {
  scriptName: string;
  source: string;
  interpreter: SieveInterpreter;
}

// inbuxa: the playground ships with the console, so the script goes nowhere
// else and there is nothing to warn about first. It runs under the limits
// of the interpreter that runs it on the server.
export function SievepadButton({ scriptName, source, interpreter }: SievepadButtonProps) {
  const { t } = useTranslation();

  const open = () => {
    openInSievepad(scriptName || t('sievepad.defaultName', 'Sieve script'), source, interpreter).catch(() => {
      toast({ title: t('sievepad.failed', "Couldn't open the Sieve playground."), variant: 'destructive' });
    });
  };

  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={open}
        disabled={!source.trim()}
        title={t('sievepad.debugHint', 'Test a copy of this script in the Sieve playground')}
      >
        <Bug className="h-4 w-4" />
        {t('sievepad.debug', 'Debug')}
      </Button>
    </div>
  );
}
