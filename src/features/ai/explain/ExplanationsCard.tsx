/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { fetchSession } from '@/services/jmap/client';
import { useAuthStore } from '@/stores/authStore';
import type { AiModelSummary } from '../localAi';
import { useExplainStore } from './explainStore';
import {
  DEFAULT_EXPLAIN,
  explainAvailable,
  fetchExplainSettings,
  saveExplainSettings,
  type ExplainSettings,
} from './explain';

/**
 * inbuxa: Local AI › Explanations (ai-explain EX-21): the switch, which model
 * explains, and the limits. Hidden on a server that predates explanations.
 */
export function ExplanationsCard({ canUpdate, models }: { canUpdate: boolean; models: AiModelSummary[] }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState<ExplainSettings | null>(null);
  const [draft, setDraft] = useState({ enabled: true, modelId: '', perHour: '', ceiling: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fill = (s: ExplainSettings) =>
    setDraft({
      enabled: s.explainEnabled,
      modelId: s.explainModelId ?? '',
      perHour: String(s.explainCallsPerHour),
      ceiling: String(s.explainCeiling / 1000),
    });

  useEffect(() => {
    const ctl = new AbortController();
    fetchExplainSettings(ctl.signal)
      .then((s) => {
        if (ctl.signal.aborted || !s) return;
        setCurrent(s);
        fill(s);
      })
      .catch(() => undefined);
    return () => ctl.abort();
  }, []);

  if (!current) return null;

  const perHour = Number(draft.perHour);
  const ceiling = Number(draft.ceiling);
  const valid = Number.isInteger(perHour) && perHour >= 1 && Number.isFinite(ceiling) && ceiling >= 1 && ceiling <= 600;

  const save = async () => {
    if (!valid) return;
    const next: ExplainSettings = {
      explainEnabled: draft.enabled,
      explainModelId: draft.modelId || null,
      explainCallsPerHour: perHour,
      explainCeiling: Math.round(ceiling * 1000),
    };
    setBusy(true);
    setError(null);
    const outcome = await saveExplainSettings(current, next).catch((e: unknown) => ({
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    }));
    if (outcome.ok) {
      setCurrent(next);
      // Explain buttons follow the switch at once
      const session = await fetchSession().catch(() => null);
      if (session) {
        useExplainStore.getState().setAvailable(explainAvailable(session, useAuthStore.getState().primaryAccountId));
      }
      toast({ title: t('explain.settingsSaved', 'Explanation settings saved.') });
    } else {
      setError(outcome.message ?? '');
    }
    setBusy(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('explain.settingsTitle', 'Explanations')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'explain.settingsLead',
            'An Explain button beside delivery failures, spam verdicts, log and trace events, and settings asks the model for a short explanation in plain words. It never takes a slot the spam filter needs, and message text is never sent.',
          )}
        </p>
        <div className="flex items-center gap-3">
          <Switch
            id="explain-enabled"
            checked={draft.enabled}
            disabled={!canUpdate || busy}
            onCheckedChange={(enabled) => setDraft({ ...draft, enabled })}
          />
          <Label htmlFor="explain-enabled">{t('explain.enabled', 'Offer explanations')}</Label>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="explain-model">{t('explain.model', 'Model')}</Label>
            <select
              id="explain-model"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm disabled:opacity-50"
              value={draft.modelId}
              disabled={!canUpdate || busy}
              onChange={(e) => setDraft({ ...draft, modelId: e.target.value })}
            >
              <option value="">{t('explain.modelDefault', 'Same as the spam filter')}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name || m.model}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="explain-per-hour">{t('explain.perHour', 'Per administrator, per hour')}</Label>
            <Input
              id="explain-per-hour"
              inputMode="numeric"
              value={draft.perHour}
              disabled={!canUpdate || busy}
              onChange={(e) => setDraft({ ...draft, perHour: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('localAi.limitDefault', 'Default: {{value}}', { value: DEFAULT_EXPLAIN.explainCallsPerHour })}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="explain-ceiling">{t('explain.ceiling', 'Longest wait')}</Label>
            <Input
              id="explain-ceiling"
              inputMode="decimal"
              value={draft.ceiling}
              disabled={!canUpdate || busy}
              onChange={(e) => setDraft({ ...draft, ceiling: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              {t('localAi.limitDefault', 'Default: {{value}}', { value: DEFAULT_EXPLAIN.explainCeiling / 1000 })}{' '}
              {t('localAi.seconds', 's')}
            </p>
          </div>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {canUpdate && (
          <Button onClick={save} disabled={busy || !valid}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('common.save', 'Save')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
