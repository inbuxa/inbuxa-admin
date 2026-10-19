/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Bug } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import type { SieveInterpreter } from '@/lib/sieveLimits';
import { openInSievepad } from '@/lib/sievepad';

/**
 * Debug: opens a copy of the script in the Sieve playground that ships with
 * the console, under the limits of the interpreter that runs it. Nothing
 * leaves the console, so there is nothing to warn about first.
 */
export function SievepadButton({
  scriptName,
  source,
  interpreter,
}: {
  scriptName: string;
  source: string;
  interpreter: SieveInterpreter;
}) {
  const { t } = useTranslation();
  const debug = () =>
    openInSievepad(scriptName || t('sievepad.defaultName', 'Sieve script'), source, interpreter).catch(() =>
      toast({ title: t('sievepad.failed', "Couldn't open the Sieve playground."), variant: 'destructive' }),
    );
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={!source.trim()}
        title={t('sievepad.debugHint', 'Test a copy of this script in the Sieve playground')}
        onClick={debug}
      >
        <Bug className="size-4" />
        {t('sievepad.debug', 'Debug')}
      </Button>
    </div>
  );
}
