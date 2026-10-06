/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: above each limits list, every rule in plain words, and the way
 * into the presets guide (settings-reorg, second wave). With no rules at
 * all it says so, since a server with no limits is worth knowing about.
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Gauge } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LaunchChoice } from '@/components/wizard/LaunchChoice';
import { getAccountId, jmapGet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import { describe, type LimitObject, type RuleRecord } from './rules';

export const LIMITS_WIZARD_VIEW = 'Wizard/limits';

/** "Guided or manual?" for limits. Manual opens the incoming limits unless told otherwise. */
export function LimitsLaunchChoice({
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
  const section = useSchemaStore((s) => s.viewToSection['x:MtaInboundThrottle']) ?? 'Settings';
  return (
    <LaunchChoice
      open={open}
      onOpenChange={onOpenChange}
      title={t('limitsSummary.chooseTitle', 'Sending and receiving limits')}
      guidedHint={t(
        'limitsSummary.guidedHint',
        'Say who uses this server and get five sensible limits, each shown as a sentence you can adjust.',
      )}
      manualHint={t('limitsSummary.manualHint', 'Add and edit each rule yourself, with every option.')}
      onGuided={() => navigate(`/${section}/${LIMITS_WIZARD_VIEW}`)}
      onManual={onManual ?? (() => navigate(`/${section}/x:MtaInboundThrottle`))}
    />
  );
}

export function LimitsSummary({ object }: { object: LimitObject }) {
  const { t } = useTranslation();
  const [rules, setRules] = useState<RuleRecord[] | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let live = true;
    jmapGet(object, getAccountId(object), null)
      .then(([res]) => live && setRules(((res?.[1] as { list?: RuleRecord[] })?.list ?? []) as RuleRecord[]))
      .catch(() => live && setRules(null));
    return () => {
      live = false;
    };
  }, [object]);

  if (rules === null) return null;

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Gauge className="h-5 w-5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 font-medium">
          {rules.length === 0
            ? t('limitsSummary.none', 'No limits here yet: nothing is slowed down or refused.')
            : t('limitsSummary.title', 'In plain words')}
        </p>
        <Button
          type="button"
          variant={rules.length === 0 ? 'default' : 'outline'}
          size="sm"
          onClick={() => setOpen(true)}
        >
          {t('limitsSummary.presets', 'Use presets')}
        </Button>
      </div>
      {rules.length > 0 && (
        <ul className="space-y-1 text-sm">
          {rules.map((r) => (
            <li key={r.id} className={r.enable === false ? 'text-muted-foreground' : undefined}>
              {describe(object, r)}
            </li>
          ))}
        </ul>
      )}
      <LimitsLaunchChoice open={open} onOpenChange={setOpen} onManual={() => undefined} />
    </div>
  );
}
