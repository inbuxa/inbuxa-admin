/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Settings › Spam Filter › Local AI. Spam filtering with a language
 * model the operator runs, off until someone turns it on here or on the
 * classifier's own form.
 *
 * Setting it up asks "Guided or manual?" each time (admin UX roadmap): guided
 * walks through what it does, the model's address and the prompt, then turns
 * it on; manual goes to the ordinary forms. Turning it off is one click and
 * keeps the model, so turning it back on is easy too.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Brain, Loader2, Power, PowerOff, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import {
  DEFAULT_LIMITS,
  DEFAULT_PROMPT,
  disableClassifier,
  enableWithModel,
  EXAMPLE_URLS,
  fetchLimits,
  fetchStatus,
  LIMIT_FIELDS,
  LimitsUnavailable,
  locality,
  RECOMMENDED_MODEL,
  saveLimits,
  type AiLimits,
  type Status,
} from './localAi';
import { formNotices } from './formExtras';

export const LOCAL_AI_VIEW = 'CustomComponent/LocalAi';

type Load<T> = { kind: 'loading' } | { kind: 'ready'; value: T } | { kind: 'error'; message: string };

export function LocalAiPage() {
  const { t } = useTranslation();
  const canUpdate = useAccountStore(
    (s) => s.hasObjectPermission('sysSpamLlm', 'Update') && s.hasObjectPermission('sysAiModel', 'Create'),
  );
  const [status, setStatus] = useState<Load<Status>>({ kind: 'loading' });
  const [mode, setMode] = useState<'idle' | 'choose' | 'guided'>('idle');
  const [busy, setBusy] = useState(false);

  const reload = useCallback((signal?: AbortSignal) => {
    fetchStatus(signal)
      .then((value) => {
        if (!signal?.aborted) setStatus({ kind: 'ready', value });
      })
      .catch((e: unknown) => {
        if (!signal?.aborted) setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) });
      });
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    reload(ctl.signal);
    return () => ctl.abort();
  }, [reload]);

  const turnOff = async () => {
    setBusy(true);
    const outcome = await disableClassifier().catch((e: unknown) => ({
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    }));
    setBusy(false);
    if (outcome.ok) {
      toast({ title: t('localAi.turnedOff', 'Local AI spam filtering is off.') });
      reload();
    } else {
      toast({ title: t('localAi.failed', 'That didn’t work'), description: outcome.message, variant: 'destructive' });
    }
  };

  if (status.kind === 'loading') return <LoadingFallback />;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Brain className="h-6 w-6" /> {t('localAi.title', 'Local AI')}
        </h1>
        <p className="text-sm text-muted-foreground">
          {t(
            'localAi.subtitle',
            'Spam filtering with a language model you run on your own machines. Off until you turn it on.',
          )}
        </p>
      </header>

      {status.kind === 'error' ? (
        <Card>
          <CardContent className="pt-6 text-sm text-destructive">{status.message}</CardContent>
        </Card>
      ) : (
        <StatusCard
          status={status.value}
          canUpdate={canUpdate}
          busy={busy}
          onSetUp={() => setMode('choose')}
          onTurnOff={turnOff}
        />
      )}

      {mode === 'choose' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('localAi.howTitle', 'Guided or manual?')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => setMode('guided')}>{t('localAi.guided', 'Guided')}</Button>
            <Button variant="outline" asChild>
              <Link to="/Settings/x:AiModel">{t('localAi.manual', 'Manual: the model and classifier forms')}</Link>
            </Button>
            <Button variant="ghost" onClick={() => setMode('idle')}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </CardContent>
        </Card>
      )}

      {mode === 'guided' && status.kind === 'ready' && (
        <GuidedSetup
          status={status.value}
          onDone={() => {
            setMode('idle');
            reload();
          }}
          onCancel={() => setMode('idle')}
        />
      )}

      <LimitsCard canUpdate={canUpdate} />
    </div>
  );
}

function StatusCard({
  status,
  canUpdate,
  busy,
  onSetUp,
  onTurnOff,
}: {
  status: Status;
  canUpdate: boolean;
  busy: boolean;
  onSetUp: () => void;
  onTurnOff: () => void;
}) {
  const { t } = useTranslation();
  const model = status.models.find((m) => m.id === status.modelId);
  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        {status.enabled ? (
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Power className="h-4 w-4 text-green-600" /> {t('localAi.on', 'On')}
            </p>
            {model && (
              <p className="text-muted-foreground">
                {t('localAi.asks', 'Asks {{name}} ({{model}}) at {{url}}', {
                  name: model.name,
                  model: model.model,
                  url: model.url,
                })}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-1 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <PowerOff className="h-4 w-4 text-muted-foreground" /> {t('localAi.off', 'Off')}
            </p>
            <p className="text-muted-foreground">
              {t(
                'localAi.offExplain',
                'The spam filter doesn’t use a language model. Nothing is sent anywhere until you set one up.',
              )}
            </p>
          </div>
        )}
        {canUpdate && (
          <div className="flex flex-wrap gap-2">
            {status.enabled ? (
              <>
                <Button variant="outline" onClick={onTurnOff} disabled={busy}>
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('localAi.turnOff', 'Turn off')}
                </Button>
                <Button variant="ghost" asChild>
                  <Link to="/Settings/x:SpamLlm">{t('localAi.editClassifier', 'Edit the classifier')}</Link>
                </Button>
              </>
            ) : (
              <Button onClick={onSetUp}>{t('localAi.setUp', 'Set up local AI spam filtering')}</Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GuidedSetup({ status, onDone, onCancel }: { status: Status; onDone: () => void; onCancel: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('local');
  const [url, setUrl] = useState(EXAMPLE_URLS.llamaCpp);
  const [model, setModel] = useState(RECOMMENDED_MODEL.model);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const notices = useMemo(() => formNotices('x:AiModel', { url }), [url]);
  const where = locality(url);

  const finish = async () => {
    setBusy(true);
    setError(null);
    const outcome = await enableWithModel({ name, url, model, prompt }, status.models).catch((e: unknown) => ({
      ok: false,
      property: undefined,
      message: e instanceof Error ? e.message : String(e),
    }));
    setBusy(false);
    if (outcome.ok) {
      toast({ title: t('localAi.turnedOn', 'Local AI spam filtering is on.') });
      onDone();
    } else {
      setError(outcome.property ? `${outcome.property}: ${outcome.message}` : (outcome.message ?? ''));
    }
  };

  const steps = [
    <div key="what" className="space-y-3 text-sm">
      <p>
        {t('localAi.whatLead', 'The spam filter will ask a language model for its opinion of each incoming message.')}
      </p>
      <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
        <li>{t('localAi.whatSent', 'Only the subject and text are sent: no addresses, headers or attachments.')}</li>
        <li>
          {t('localAi.whatBounded', 'Its opinion is one signal among many, adding at most {{max}} points by default.', {
            max: DEFAULT_LIMITS.spamMaxAdded,
          })}
        </li>
        <li>{t('localAi.whatNeverHolds', 'If the model is slow or down, mail is never held up.')}</li>
        <li>
          {t(
            'localAi.whatModel',
            'Run the model yourself, on this machine or your own network: llama.cpp’s server or Ollama both work. We recommend {{label}} ({{license}}) with at least {{cpus}} CPU cores.',
            { label: RECOMMENDED_MODEL.label, license: RECOMMENDED_MODEL.license, cpus: RECOMMENDED_MODEL.minCpus },
          )}
        </li>
      </ul>
    </div>,
    <div key="model" className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="ai-url">{t('localAi.url', 'Model address')}</Label>
        <Input id="ai-url" value={url} onChange={(e) => setUrl(e.target.value)} />
        <p className="text-xs text-muted-foreground">
          {t('localAi.urlHint', 'llama.cpp: {{llama}} · Ollama: {{ollama}}', {
            llama: EXAMPLE_URLS.llamaCpp,
            ollama: EXAMPLE_URLS.ollama,
          })}
        </p>
      </div>
      {notices.map((n) => (
        <p
          key={n.key}
          role={n.tone === 'warning' ? 'alert' : 'note'}
          className={
            n.tone === 'warning'
              ? 'rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm'
              : 'rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground'
          }
        >
          {t(n.key, n.text)}
        </p>
      ))}
      <div className="space-y-1.5">
        <Label htmlFor="ai-model">{t('localAi.model', 'Model name')}</Label>
        <Input id="ai-model" value={model} onChange={(e) => setModel(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="ai-name">{t('localAi.name', 'Name in inbuxa')}</Label>
        <Input id="ai-name" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </div>,
    <div key="prompt" className="space-y-1.5">
      <Label htmlFor="ai-prompt">{t('localAi.prompt', 'Instructions for the model')}</Label>
      <Textarea id="ai-prompt" rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      <p className="text-xs text-muted-foreground">
        {t(
          'localAi.promptHint',
          'The default was measured against real mail. The server adds its own framing so the message is treated as data, not instructions.',
        )}
      </p>
    </div>,
  ];

  const canNext =
    step === 0 || (step === 1 && where !== 'invalid' && model.trim() !== '' && name.trim() !== '') || step === 2;
  const last = step === steps.length - 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {t('localAi.stepOf', 'Step {{n}} of {{total}}', { n: step + 1, total: steps.length })}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {steps[step]}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={busy}>
              {t('common.back', 'Back')}
            </Button>
          )}
          {last ? (
            <Button onClick={finish} disabled={busy || prompt.trim() === ''}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('localAi.turnOn', 'Turn on')}
            </Button>
          ) : (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
              {t('common.next', 'Next')}
            </Button>
          )}
          <Button variant="ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const LIMIT_LABELS: Record<
  keyof AiLimits,
  { key: string; text: string; unit: 'points' | 'seconds' | 'count' | 'bytes' }
> = {
  spamMaxAdded: { key: 'localAi.limit.spamMaxAdded', text: 'Most the model can add to a score', unit: 'points' },
  spamMaxSubtracted: {
    key: 'localAi.limit.spamMaxSubtracted',
    text: 'Most the model can take off a score',
    unit: 'points',
  },
  spamCallCeiling: {
    key: 'localAi.limit.spamCallCeiling',
    text: 'Longest the spam filter waits for the model',
    unit: 'seconds',
  },
  maxConcurrentCalls: { key: 'localAi.limit.maxConcurrentCalls', text: 'Requests in flight at once', unit: 'count' },
  maxContentBytes: { key: 'localAi.limit.maxContentBytes', text: 'Most message text sent', unit: 'bytes' },
  failureBackoff: { key: 'localAi.limit.failureBackoff', text: 'Pause after repeated failures', unit: 'seconds' },
  userCallsPerHour: {
    key: 'localAi.limit.userCallsPerHour',
    text: 'Calls per account per hour from its own Sieve scripts',
    unit: 'count',
  },
};

/** Durations travel in milliseconds and show in seconds. */
function toShown(key: keyof AiLimits, v: number): number {
  return LIMIT_LABELS[key].unit === 'seconds' ? v / 1000 : v;
}
function fromShown(key: keyof AiLimits, v: number): number {
  return LIMIT_LABELS[key].unit === 'seconds' ? Math.round(v * 1000) : v;
}

function LimitsCard({ canUpdate }: { canUpdate: boolean }) {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load<AiLimits>>({ kind: 'loading' });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fill = (limits: AiLimits) =>
    setDraft(Object.fromEntries(LIMIT_FIELDS.map((k) => [k, String(toShown(k, limits[k]))])));

  useEffect(() => {
    const ctl = new AbortController();
    fetchLimits(ctl.signal)
      .then((value) => {
        if (ctl.signal.aborted) return;
        setLoad({ kind: 'ready', value });
        fill(value);
      })
      .catch((e: unknown) => {
        if (ctl.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof LimitsUnavailable
              ? t('localAi.limitsUnavailable', 'This server doesn’t offer AI limits.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => ctl.abort();
  }, [t]);

  if (load.kind !== 'ready') {
    return load.kind === 'error' ? (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">{load.message}</CardContent>
      </Card>
    ) : null;
  }

  const parsed = (): AiLimits | null => {
    const out = { ...load.value };
    for (const k of LIMIT_FIELDS) {
      const n = Number(draft[k]);
      if (draft[k] === undefined || draft[k].trim() === '' || !Number.isFinite(n) || n < 0) return null;
      out[k] = fromShown(k, n);
    }
    return out;
  };

  const save = async (next: AiLimits) => {
    setBusy(true);
    setError(null);
    const outcome = await saveLimits(load.value, next).catch((e: unknown) => ({
      ok: false,
      property: undefined,
      message: e instanceof Error ? e.message : String(e),
    }));
    setBusy(false);
    if (outcome.ok) {
      setLoad({ kind: 'ready', value: next });
      fill(next);
      toast({ title: t('localAi.limitsSaved', 'Limits saved.') });
    } else {
      setError(outcome.message ?? '');
    }
  };

  const next = parsed();
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('localAi.limitsTitle', 'Limits')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {t(
            'localAi.limitsLead',
            'These keep the model’s influence small and its load bounded. The defaults suit a small CPU-only server.',
          )}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {LIMIT_FIELDS.map((k) => (
            <div key={k} className="space-y-1.5">
              <Label htmlFor={`limit-${k}`}>{t(LIMIT_LABELS[k].key, LIMIT_LABELS[k].text)}</Label>
              <Input
                id={`limit-${k}`}
                inputMode="decimal"
                value={draft[k] ?? ''}
                disabled={!canUpdate || busy}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">
                {t('localAi.limitDefault', 'Default: {{value}}', { value: toShown(k, DEFAULT_LIMITS[k]) })}
                {LIMIT_LABELS[k].unit === 'seconds' ? ` ${t('localAi.seconds', 's')}` : ''}
              </p>
            </div>
          ))}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        {canUpdate && (
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => next && save(next)} disabled={busy || !next}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('common.save', 'Save')}
            </Button>
            <Button variant="ghost" onClick={() => save({ ...DEFAULT_LIMITS })} disabled={busy}>
              <RotateCcw className="mr-2 h-4 w-4" />
              {t('localAi.resetDefaults', 'Reset to defaults')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
