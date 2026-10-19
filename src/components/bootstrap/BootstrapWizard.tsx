/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * First-run setup: the server's `x:Bootstrap` form, one section per step,
 * saved in one update at the end. Shown instead of the console while the
 * signed-in account can see nothing but this.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Check, Copy, Loader2, Rocket } from 'lucide-react';
import { DefaultLogo } from '@/components/common/Logo';
import { FieldWidget } from '@/components/forms/FieldWidget';
import { FormEditionContext } from '@/components/forms/FormEditionContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { calculateJmapPatch } from '@/lib/jmapPatch';
import { friendlySetError, validationErrorMessage } from '@/lib/jmapErrors';
import { buildCreateDefaults, deepMerge, resolveForm, resolveObject, resolveSchema } from '@/lib/schemaResolver';
import { getAccountId, jmapGet, jmapSet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import {
  credentials,
  fieldLabels,
  firstMissing,
  missingOnPage,
  readSetResult,
  refusalByField,
  wizardPages,
} from './wizard';

const VIEW = 'x:Bootstrap';

/** The singleton's id; there is only one bootstrap object. */
const SINGLETON = 'singleton';

/** The bootstrap object, its fields and its form, once the schema is in. */
function useBootstrapSchema() {
  const schema = useSchemaStore((s) => s.schema);
  return useMemo(() => {
    const object = schema && resolveObject(schema, VIEW);
    const resolved = object && resolveSchema(schema, object.objectName);
    if (!schema || !object || resolved?.type !== 'single') return null;
    const form = resolveForm(schema, VIEW, object.objectName, resolved.schemaName);
    return { schema, object, resolved, form, pages: wizardPages(resolved.fields, form) };
  }, [schema]);
}

export function BootstrapWizard() {
  const { t } = useTranslation();
  const setup = useBootstrapSchema();

  const [values, setValues] = useState<Record<string, unknown>>({});
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [generated, setGenerated] = useState<Record<string, unknown> | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Start from the schema's defaults, with whatever the server already has on top.
  useEffect(() => {
    if (!setup) return;
    const { schema, object, resolved, pages } = setup;
    const properties = ['id', ...new Set(pages.flatMap((p) => p.fields.map((f) => f.formField.name)))];
    const abort = new AbortController();
    void (async () => {
      setLoading(true);
      try {
        const responses = await jmapGet(
          object.objectName,
          getAccountId(object.objectName),
          [SINGLETON],
          properties,
          abort.signal,
        );
        if (abort.signal.aborted) return;
        const current = (responses[0]?.[1]?.list as Record<string, unknown>[] | undefined)?.[0] ?? {};
        setValues(deepMerge(buildCreateDefaults(schema, object, resolved), current));
      } catch (err) {
        if (abort.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : t('bootstrap.failedToLoad', 'Failed to load bootstrap state.'));
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [setup, t]);

  const change = useCallback((name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setFieldErrors((prev) => {
      if (!(name in prev)) return prev;
      const { [name]: _cleared, ...rest } = prev;
      void _cleared;
      return rest;
    });
  }, []);

  const required = t('form.required', 'This field is required.');
  const correctBelow = () => t('form.correctErrorsBelow', 'Please correct the errors below.');

  /** Shows errors and moves to the page that has the first one. */
  const showErrors = (errors: Record<string, string>, page: number | null) => {
    setFieldErrors(errors);
    if (page !== null) setStep(page);
  };

  const clearErrors = () => {
    setError(null);
    setFieldErrors({});
  };

  if (!setup) {
    return <Waiting>{t('form.loadingSchema', 'Loading schema...')}</Waiting>;
  }
  if (loading) {
    return <Waiting>{t('bootstrap.loadingSetup', 'Loading setup...')}</Waiting>;
  }

  const { schema, object, resolved, form, pages } = setup;

  if (generated !== null) {
    const copy = async (key: string, value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        setCopied(key);
        setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
      } catch {
        toast({
          title: t('bootstrap.copyFailed', 'Copy failed'),
          description: t('bootstrap.clipboardBlocked', 'Your browser blocked clipboard access.'),
          variant: 'destructive',
        });
      }
    };
    return (
      <Shell>
        <Finished
          values={credentials(generated)}
          label={fieldLabels(form, resolved.fields)}
          copied={copied}
          onCopy={copy}
        />
      </Shell>
    );
  }

  if (pages.length === 0) {
    return (
      <Shell>
        <div className="rounded-md border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          {t('bootstrap.emptyForm', 'Setup form is empty. The server did not return any bootstrap fields.')}
        </div>
      </Shell>
    );
  }

  const page = pages[step];
  const last = step === pages.length - 1;

  const next = () => {
    const missing = missingOnPage(page, values, required);
    if (Object.keys(missing).length > 0) {
      setFieldErrors(missing);
      setError(correctBelow());
      return;
    }
    clearErrors();
    setStep(Math.min(step + 1, pages.length - 1));
  };

  const back = () => {
    clearErrors();
    setStep(Math.max(step - 1, 0));
  };

  const finish = async () => {
    const missing = firstMissing(pages, values, required);
    if (missing.page !== null) {
      setError(correctBelow());
      showErrors(missing.errors, missing.page);
      return;
    }
    setSaving(true);
    clearErrors();
    try {
      // Everything goes in the patch: setup starts from nothing on the server.
      const responses = await jmapSet(object.objectName, getAccountId(object.objectName), {
        update: { [SINGLETON]: calculateJmapPatch({}, values) },
      });
      const outcome = readSetResult(responses.at(-1)?.[1]);
      if (outcome.kind === 'updated') {
        setGenerated(outcome.extras);
      } else if (outcome.kind === 'refused') {
        setError(friendlySetError(outcome.error));
        const refusal = refusalByField(outcome.error, pages, {
          invalid: t('form.invalidValue', 'Invalid value.'),
          validation: validationErrorMessage,
        });
        if (Object.keys(refusal.errors).length > 0) showErrors(refusal.errors, refusal.page);
      } else {
        setError(t('bootstrap.noConfirm', 'The server did not confirm the update.'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bootstrap.failedToComplete', 'Failed to complete setup.'));
    } finally {
      setSaving(false);
    }
  };

  const stepOf = t('bootstrap.stepOf', 'Step {{current}} of {{total}}', { current: step + 1, total: pages.length });

  return (
    <Shell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('bootstrap.welcome', 'Welcome to inbuxa')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {t('bootstrap.welcomeSubtitle', "Let's get your server set up.")}
          </p>
        </div>

        <div className="flex items-center gap-2" aria-label={stepOf}>
          {pages.map((_, i) => (
            <div
              key={i}
              className={`h-2 w-2 rounded-full transition-colors ${i <= step ? 'bg-primary' : 'bg-muted-foreground/20'}`}
            />
          ))}
        </div>

        {error && (
          <div className="rounded-md bg-destructive/10 border border-destructive/20 p-4">
            <p className="text-sm text-destructive whitespace-pre-line">{error}</p>
          </div>
        )}

        <Card>
          {page.title && (
            <CardHeader>
              <CardTitle className="text-base">{page.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className={page.title ? '' : 'pt-6'}>
            <div className="space-y-6">
              {/* Enterprise-only options stay out of setup. */}
              <FormEditionContext.Provider value="oss">
                {page.fields.map(({ formField, field }) => (
                  <FieldWidget
                    key={formField.name}
                    field={field}
                    formField={formField}
                    value={values[formField.name]}
                    onChange={(v) => change(formField.name, v)}
                    readOnly={saving}
                    error={fieldErrors[formField.name]}
                    schema={schema}
                  />
                ))}
              </FormEditionContext.Provider>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-between pt-2">
          <Button type="button" variant="outline" onClick={back} disabled={step === 0 || saving}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t('common.back', 'Back')}
          </Button>
          <div className="text-xs text-muted-foreground">{stepOf}</div>
          {last ? (
            <Button type="button" onClick={finish} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Rocket className="h-4 w-4 mr-2" />}
              {t('bootstrap.finishSetup', 'Finish setup')}
            </Button>
          ) : (
            <Button type="button" onClick={next} disabled={saving}>
              {t('common.next', 'Next')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** The page around every step: the logo bar and a centered column. */
function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-content-background">
      <header className="flex items-center px-6 py-4 border-b bg-background">
        <DefaultLogo />
      </header>
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}

function Waiting({ children }: { children: ReactNode }) {
  return (
    <Shell>
      <div className="flex items-center justify-center p-12 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        {children}
      </div>
    </Shell>
  );
}

interface FinishedProps {
  values: [string, string][];
  label: (name: string) => string;
  copied: string | null;
  onCopy: (key: string, value: string) => void;
}

/** Setup is done: what the server generated, to write down now, and the restart that comes next. */
function Finished({ values, label, copied, onCopy }: FinishedProps) {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Check className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{t('bootstrap.complete', 'Setup complete')}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {values.length > 0
              ? t(
                  'bootstrap.credentialsCreated',
                  'Your administrator account has been created. Write these down now: the password will not be shown again.',
                )
              : t('bootstrap.configuredSuccessfully', 'inbuxa has been configured successfully.')}
          </p>
        </div>
      </div>

      {values.length > 0 && (
        <Card>
          <CardContent className="pt-6 space-y-4">
            {values.map(([key, value]) => (
              <div key={key} className="space-y-1.5">
                <div className="text-sm font-medium">{label(key)}</div>
                <div className="flex gap-2">
                  <code className="flex-1 rounded bg-muted p-2 text-sm break-all select-all">{value}</code>
                  <Button type="button" variant="outline" size="sm" onClick={() => onCopy(key, value)}>
                    {copied === key ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="rounded-md border border-primary/20 bg-primary/5 p-4">
        <p className="text-sm">
          <span className="font-medium">{t('bootstrap.nextStepLabel', 'Next step:')}</span>{' '}
          {t(
            'bootstrap.nextStepBody',
            'restart inbuxa for the new configuration to take effect. Once restarted, sign in with the credentials above to continue administering your server.',
          )}
        </p>
      </div>
    </div>
  );
}

export default BootstrapWizard;
