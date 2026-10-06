/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: guided setup, "Sending and receiving limits" (settings-reorg,
 * second wave). "Who uses this server?" picks starting numbers for five
 * rules, each shown as a sentence you can adjust; the guide writes them as
 * marked presets and never touches rules made by hand.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { WizardNote, WizardShell, type WizardStep } from '@/components/wizard/WizardShell';
import { getAccountId, jmapRequest, jmapSet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { cn } from '@/lib/utils';
import {
  currentValue,
  findPreset,
  PRESET_MARK,
  PRESET_RULES,
  presetRecord,
  PROFILES,
  type LimitObject,
  type Profile,
  type RuleRecord,
} from './rules';

const OBJECTS: LimitObject[] = ['x:MtaInboundThrottle', 'x:MtaOutboundThrottle', 'x:MtaQueueQuota'];

type Saved = Record<LimitObject, RuleRecord[]>;

async function loadRules(): Promise<Saved> {
  const res = await jmapRequest(
    OBJECTS.map((o, i) => [`${o}/get`, { accountId: getAccountId(o), ids: null }, String(i)]),
  );
  const out = {} as Saved;
  OBJECTS.forEach((o, i) => {
    out[o] = ((res.find(([, , id]) => id === String(i))?.[1] as { list?: RuleRecord[] })?.list ?? []) as RuleRecord[];
  });
  return out;
}

export function LimitsSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const section = viewToSection['x:MtaInboundThrottle'] ?? 'Settings';

  const [saved, setSaved] = useState<Saved | null>(null);
  const [step, setStep] = useState(0);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [included, setIncluded] = useState<Set<string>>(new Set(PRESET_RULES.map((r) => r.id)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadRules()
      .then((s) => live && setSaved(s))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const steps: WizardStep[] = useMemo(
    () => [
      { id: 'who', title: t('limitsSetup.stepWho', 'Who uses it') },
      { id: 'adjust', title: t('limitsSetup.stepAdjust', 'Limits') },
      { id: 'review', title: t('limitsSetup.stepReview', 'Review') },
      { id: 'done', title: t('limitsSetup.stepDone', 'Done') },
    ],
    [t],
  );

  const choose = (p: Profile) => {
    setProfile(p);
    setValues(Object.fromEntries(PRESET_RULES.map((r) => [r.id, String(r.values[p])])));
  };

  const plan = useMemo(() => {
    if (!saved) return [];
    return PRESET_RULES.map((rule) => {
      const existing = findPreset(rule, saved);
      const n = Number(values[rule.id]);
      const on = included.has(rule.id) && Number.isInteger(n) && n > 0;
      if (on && !existing) return { rule, action: 'add' as const, n };
      if (on && existing && (currentValue(rule, existing) !== n || existing.enable === false))
        return { rule, action: 'update' as const, n, id: existing.id! };
      if (!on && existing) return { rule, action: 'remove' as const, n, id: existing.id! };
      return { rule, action: 'keep' as const, n };
    });
  }, [saved, values, included]);

  const handMade = saved
    ? OBJECTS.reduce((sum, o) => sum + saved[o].filter((r) => !(r.description ?? '').startsWith(PRESET_MARK)).length, 0)
    : 0;
  const valid = PRESET_RULES.every(
    (r) => !included.has(r.id) || (Number.isInteger(Number(values[r.id])) && Number(values[r.id]) > 0),
  );

  const apply = async () => {
    setBusy(true);
    setError(null);
    const failed: string[] = [];
    for (const object of OBJECTS) {
      const mine = plan.filter((p) => p.rule.object === object && p.action !== 'keep');
      if (mine.length === 0) continue;
      const create: Record<string, Record<string, unknown>> = {};
      const update: Record<string, Record<string, unknown>> = {};
      const destroy: string[] = [];
      for (const p of mine) {
        if (p.action === 'add') create[p.rule.id] = { ...presetRecord(p.rule, p.n) };
        if (p.action === 'update') update[p.id] = { ...presetRecord(p.rule, p.n) };
        if (p.action === 'remove') destroy.push(p.id);
      }
      try {
        const [res] = await jmapSet(object, getAccountId(object), { create, update, destroy });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        for (const bad of [body?.notCreated, body?.notUpdated, body?.notDestroyed]) {
          for (const e of Object.values(bad ?? {})) failed.push(e.description ?? e.type);
        }
      } catch (e) {
        failed.push(e instanceof Error ? e.message : String(e));
      }
    }
    setBusy(false);
    if (failed.length > 0) {
      setError(failed.join('; '));
      setSaved(await loadRules().catch(() => saved));
      return;
    }
    setStep(3);
  };

  if (!saved) return error ? <div className="p-8 text-center text-destructive">{error}</div> : <LoadingFallback />;

  const common = {
    icon: 'gauge',
    title: t('limitsSetup.title', 'Sending and receiving limits'),
    subtitle: t(
      'limitsSetup.subtitle',
      'Sensible rate limits for the people who use this server. Without any, one stolen password can send as much spam as it likes.',
    ),
    steps,
    current: step,
    onCancel: () => navigate(`/${section}/x:MtaInboundThrottle`),
  };

  // ── Step 1: who ──
  if (step === 0) {
    const label: Record<Profile, [string, string]> = {
      personal: [
        t('limitsSetup.personal', 'Me and my family'),
        t('limitsSetup.personalHint', 'A handful of people you know. Low limits: nobody here sends in bulk.'),
      ],
      organization: [
        t('limitsSetup.organization', 'A company or school'),
        t('limitsSetup.organizationHint', 'Tens to hundreds of known people, some of whom send a lot in a day.'),
      ],
      hosting: [
        t('limitsSetup.hosting', 'Open to the public'),
        t(
          'limitsSetup.hostingHint',
          'People you don’t know sign up. Tight sending limits, because compromised accounts are the risk.',
        ),
      ],
    };
    return (
      <WizardShell
        {...common}
        canNext={profile !== null}
        onNext={() => setStep(1)}
        aside={
          <WizardNote title={t('limitsSetup.handTitle', 'Your own rules stay')}>
            <p>
              {handMade > 0
                ? t('limitsSetup.handSome', 'The {{count}} rules made by hand are left exactly as they are.', {
                    count: handMade,
                  })
                : t('limitsSetup.handNone', 'Rules you add by hand later are never touched by this guide.')}
            </p>
          </WizardNote>
        }
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {PROFILES.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={profile === p}
              onClick={() => choose(p)}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors hover:border-primary/60',
                profile === p ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card',
              )}
            >
              <span className="font-medium">{label[p][0]}</span>
              <span className="text-xs text-muted-foreground">{label[p][1]}</span>
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  // ── Step 2: adjust ──
  if (step === 1) {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        canNext={valid}
        aside={
          <WizardNote title={t('limitsSetup.overTitle', 'When a limit is reached')}>
            <p>
              {t(
                'limitsSetup.over',
                'Incoming: the other side is told to try again later. Outgoing: the delivery waits in the queue and goes out when the rate allows. Nothing is lost.',
              )}
            </p>
          </WizardNote>
        }
      >
        <ul className="space-y-3">
          {PRESET_RULES.map((rule) => {
            const existing = findPreset(rule, saved);
            const on = included.has(rule.id);
            const n = Number(values[rule.id]);
            return (
              <li key={rule.id} className={cn('flex items-start gap-3 rounded-xl border p-4', !on && 'opacity-60')}>
                <Checkbox
                  checked={on}
                  aria-label={rule.name}
                  onCheckedChange={(v) =>
                    setIncluded((s) => {
                      const next = new Set(s);
                      if (v) next.add(rule.id);
                      else next.delete(rule.id);
                      return next;
                    })
                  }
                  className="mt-1"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <p className="text-sm">
                    {rule.sentence(Number.isInteger(n) && n > 0 ? n : rule.values[profile ?? 'personal'])}
                  </p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      value={values[rule.id] ?? ''}
                      disabled={!on}
                      onChange={(e) => setValues((v) => ({ ...v, [rule.id]: e.target.value }))}
                      className="h-8 w-28"
                      aria-label={rule.name}
                    />
                    {existing && (
                      <span className="text-xs text-muted-foreground">
                        {t('limitsSetup.now', 'Now: {{value}}', { value: currentValue(rule, existing) ?? '—' })}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </WizardShell>
    );
  }

  // ── Step 3: review ──
  if (step === 2) {
    const changes = plan.filter((p) => p.action !== 'keep');
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(1)}
        onNext={changes.length > 0 ? () => void apply() : () => setStep(3)}
        nextLabel={changes.length > 0 ? t('limitsSetup.apply', 'Save these limits') : t('wizard.next', 'Next')}
        busy={busy}
        aside={
          <WizardNote tone="undo" title={t('limitsSetup.undoTitle', 'Changing your mind')}>
            <p>
              {t(
                'limitsSetup.undo',
                'Run the guide again, or switch any rule off in its list. Rules the guide wrote start with “Preset:”.',
              )}
            </p>
          </WizardNote>
        }
      >
        {changes.length === 0 ? (
          <p className="text-sm">{t('limitsSetup.nothing', 'These limits are already in place. Nothing changes.')}</p>
        ) : (
          <>
            <p className="font-medium">{t('limitsSetup.willChange', 'What will change')}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {changes.map((p) => (
                <li key={p.rule.id}>
                  {p.action === 'add' && t('limitsSetup.add', 'Add: {{sentence}}', { sentence: p.rule.sentence(p.n) })}
                  {p.action === 'update' &&
                    t('limitsSetup.update', 'Change: {{sentence}}', { sentence: p.rule.sentence(p.n) })}
                  {p.action === 'remove' &&
                    t('limitsSetup.remove', 'Remove the preset rule for {{name}}.', { name: p.rule.name })}
                </li>
              ))}
            </ul>
          </>
        )}
        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </WizardShell>
    );
  }

  // ── Step 4: done ──
  return (
    <WizardShell
      {...common}
      onNext={() => navigate(`/${section}/x:MtaInboundThrottle`)}
      nextLabel={t('wizard.finish', 'Finish')}
    >
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        {t('limitsSetup.done', 'The limits are in place.')}
      </p>
      <p className="text-sm text-muted-foreground">
        {t('limitsSetup.doneHint', 'Each list shows its rules in plain words:')}{' '}
        <Link className="text-primary hover:underline" to={`/${section}/x:MtaInboundThrottle`}>
          {t('limitsSetup.inbound', 'incoming')}
        </Link>
        {', '}
        <Link className="text-primary hover:underline" to={`/${section}/x:MtaOutboundThrottle`}>
          {t('limitsSetup.outbound', 'outgoing')}
        </Link>
        {', '}
        <Link className="text-primary hover:underline" to={`/${section}/x:MtaQueueQuota`}>
          {t('limitsSetup.quotas', 'queue quotas')}
        </Link>
        .
      </p>
    </WizardShell>
  );
}
