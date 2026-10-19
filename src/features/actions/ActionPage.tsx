/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { ChevronRight, CircleAlert, CircleCheck, Loader2, Zap } from 'lucide-react';
import { FieldWidget } from '@/components/forms/FieldWidget';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DynamicView } from '@/components/views/DynamicView';
import { ExplainButton } from '@/features/ai/explain/ExplainButton';
import { spamVerdictSubject } from '@/features/ai/explain/explain';
import { resolveObject, resolveSchema, resolveVariantForm } from '@/lib/schemaResolver';
import { getAccountId, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { ObjectVariant, Schema } from '@/types/schema';
import {
  actionPayload,
  CREATE_ID,
  groupActions,
  inputSections,
  missingInputs,
  readActionResult,
  splitLabel,
} from './actions';

type Stage =
  | { kind: 'pick' }
  /** An action without options, opened from the command palette, waits for Run. */
  | { kind: 'confirm'; variant: ObjectVariant }
  | { kind: 'form'; variant: ObjectVariant; values: Record<string, unknown> }
  | { kind: 'running'; variant: ObjectVariant }
  | { kind: 'done'; variant: ObjectVariant; values: Record<string, unknown>; returned: Record<string, unknown> | null }
  | { kind: 'failed'; error: string };

/** An action's options, starting from the schema's defaults. */
const defaultsFor = (schema: Schema, variant: ObjectVariant) => ({
  ...(variant.schemaName ? schema.fields[variant.schemaName]?.defaults : undefined),
});

export function ActionPage({ viewName }: { viewName: string }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const [stage, setStage] = useState<Stage>({ kind: 'pick' });
  const [searchParams, setSearchParams] = useSearchParams();

  const object = useMemo(() => (schema ? resolveObject(schema, viewName) : null), [schema, viewName]);
  const variants = useMemo(() => {
    const resolved = schema && object ? resolveSchema(schema, object.objectName) : null;
    return resolved?.type === 'multiple' ? resolved.variants : null;
  }, [schema, object]);
  const canRun = object ? hasObjectPermission(object.permissionPrefix, 'Create') : false;
  const allowed = (name: string) => hasPermission(`action${name}`);

  const run = async (variant: ObjectVariant, values: Record<string, unknown>) => {
    if (!schema || !object) return;
    setStage({ kind: 'running', variant });
    const fields = variant.schemaName ? (schema.fields[variant.schemaName] ?? null) : null;
    try {
      const responses = await jmapSet(object.objectName, getAccountId(object.objectName), {
        create: { [CREATE_ID]: actionPayload(variant.name, fields, values) },
      });
      const result = readActionResult(responses.at(-1)?.[1]);
      setStage(
        result.kind === 'done'
          ? { kind: 'done', variant, values, returned: result.returned }
          : { kind: 'failed', error: result.reason ?? t('actions.actionFailed', 'Action failed.') },
      );
    } catch (e) {
      setStage({ kind: 'failed', error: e instanceof Error ? e.message : t('actions.actionFailed', 'Action failed.') });
    }
  };

  /** A click on an action runs it at once when it has no options, else opens them. */
  const open = (variant: ObjectVariant) => {
    if (!schema) return;
    if (variant.schemaName) setStage({ kind: 'form', variant, values: defaultsFor(schema, variant) });
    else void run(variant, {});
  };

  // `?action=<name>` from the command palette opens that action, asking
  // first for one without options. It's read while rendering so it also
  // works when the palette is used on this page; the effect then takes it
  // out of the address.
  const requested = searchParams.get('action');
  const [handled, setHandled] = useState<string | null>(null);
  if (requested !== handled) {
    setHandled(requested);
    const variant = requested ? variants?.find((v) => v.name === requested) : undefined;
    if (schema && variant && canRun && allowed(variant.name)) {
      setStage(
        variant.schemaName
          ? { kind: 'form', variant, values: defaultsFor(schema, variant) }
          : { kind: 'confirm', variant },
      );
    }
  }
  useEffect(() => {
    if (!requested) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete('action');
        return next;
      },
      { replace: true },
    );
  }, [requested, setSearchParams]);

  if (!schema || !object || !variants) return null;
  const toList = () => setStage({ kind: 'pick' });

  switch (stage.kind) {
    case 'pick': {
      const list = schema.lists[viewName] ?? schema.lists[object.objectName];
      const subtitle = list?.subtitle ?? object.objectType.description;
      const other = t('actions.otherGroup', 'Other');
      return (
        <div className="space-y-6">
          <div>
            <h1 className="text-xl font-semibold">{list?.title ?? t('actions.title', 'Actions')}</h1>
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="space-y-6">
            {[...groupActions(variants, allowed, other)].map(([group, members]) => (
              <div key={group}>
                <h3 className="text-sm font-medium text-muted-foreground mb-2">{group}</h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {members.map((variant) => (
                    <Button
                      key={variant.name}
                      variant="outline"
                      className="justify-between h-auto py-3 px-4"
                      disabled={!canRun}
                      onClick={() => open(variant)}
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{splitLabel(variant.label, other).name}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    case 'confirm':
      return (
        <Narrow>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
              {stage.variant.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm">
              {t('actions.confirmRun', 'This runs on the server as soon as you choose Run. It has no options.')}
            </p>
            <div className="flex gap-2">
              <Button onClick={() => open(stage.variant)}>{t('actions.run', 'Run')}</Button>
              <Button variant="outline" onClick={toList}>
                {t('actions.backToActions', 'Back to actions')}
              </Button>
            </div>
          </CardContent>
        </Narrow>
      );

    case 'form':
      return (
        <OptionsForm
          schema={schema}
          variant={stage.variant}
          initial={stage.values}
          onRun={(values) => void run(stage.variant, values)}
          onBack={toList}
        />
      );

    case 'running':
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">
            {t('actions.executing', 'Executing {{label}}...', { label: stage.variant.label })}
          </p>
        </div>
      );

    case 'done':
      return (
        <ActionDone
          schema={schema}
          variant={stage.variant}
          values={stage.values}
          returned={stage.returned}
          onAnother={toList}
        />
      );

    case 'failed':
      return (
        <Narrow>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CircleAlert className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-medium">{t('actions.failedTitle', 'Action failed')}</p>
                <p className="text-sm text-muted-foreground mt-1">{stage.error}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={toList}>
                {t('actions.backToActions', 'Back to actions')}
              </Button>
            </div>
          </CardContent>
        </Narrow>
      );
  }
}

function Narrow({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-xl space-y-4 pt-8">
      <Card>{children}</Card>
    </div>
  );
}

interface OptionsFormProps {
  schema: Schema;
  variant: ObjectVariant;
  initial: Record<string, unknown>;
  onRun: (values: Record<string, unknown>) => void;
  onBack: () => void;
}

/** An action's options, from its variant's form, with only the fields an admin sets. */
function OptionsForm({ schema, variant, initial, onRun, onBack }: OptionsFormProps) {
  const { t } = useTranslation();
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const fields = variant.schemaName ? schema.fields[variant.schemaName] : undefined;
  const form = resolveVariantForm(schema, '', '', variant.schemaName);
  if (!fields || !form) return null;
  const sections = inputSections(fields, form);

  const change = (name: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors(({ [name]: _cleared, ...rest }) => (void _cleared, rest));
  };

  const submit = () => {
    const missing = missingInputs(sections, fields, values, t('form.required', 'This field is required.'));
    if (Object.keys(missing).length > 0) setErrors(missing);
    else onRun(values);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          {t('common.back', 'Back')}
        </Button>
        <h1 className="text-xl font-semibold">{variant.label}</h1>
      </div>

      {sections.map((section, i) => (
        <Card key={i}>
          {section.title && (
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className={section.title ? 'pt-0' : ''}>
            <div className="space-y-4">
              {section.fields.map((ff) => (
                <FieldWidget
                  key={ff.name}
                  formField={ff}
                  field={fields.properties[ff.name]}
                  value={values[ff.name]}
                  onChange={(v) => change(ff.name, v)}
                  readOnly={false}
                  schema={schema}
                  error={errors[ff.name]}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={submit}>
          <Zap className="mr-2 h-4 w-4" />
          {t('actions.execute', 'Execute')}
        </Button>
      </div>
    </div>
  );
}

interface ActionDoneProps {
  schema: Schema;
  variant: ObjectVariant;
  values: Record<string, unknown>;
  returned: Record<string, unknown> | null;
  onAnother: () => void;
}

/** The action ran: its options and what the server sent back, shown through the variant's own view. */
function ActionDone({ schema, variant, values, returned, onAnother }: ActionDoneProps) {
  const { t } = useTranslation();
  const data = useMemo(() => ({ ...values, ...returned }), [values, returned]);
  const shown = useMemo(() => new Set(Object.keys(data)), [data]);
  const hasData = !!variant.schemaName && shown.size > 0;

  return (
    <div className="space-y-6 pt-4">
      <div className="flex items-center gap-3">
        <CircleCheck className="h-5 w-5 text-emerald-500 shrink-0" />
        <div>
          <p className="font-medium">{variant.label}</p>
          <p className="text-sm text-muted-foreground">
            {t('actions.executedSuccess', 'Action executed successfully.')}
          </p>
        </div>
      </div>

      {hasData && variant.schemaName && (
        <DynamicView
          schema={schema}
          objectName={variant.schemaName}
          viewName={variant.schemaName}
          data={data}
          visibleFields={shown}
        />
      )}

      {/* "Explain this" for a spam verdict (ai-explain EX-17). */}
      {variant.name === 'ClassifySpam' && returned && (
        <ExplainButton
          subject={() => spamVerdictSubject(returned)}
          title={t('explain.spamVerdictTitle', 'Spam verdict: {{result}}', { result: String(returned.result ?? '') })}
        />
      )}

      {!hasData && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('actions.noAdditionalData', 'No additional data returned.')}
          </CardContent>
        </Card>
      )}

      <Button onClick={onAnother}>
        <Zap className="mr-2 h-4 w-4" />
        {t('actions.executeAnother', 'Execute another action')}
      </Button>
    </div>
  );
}
