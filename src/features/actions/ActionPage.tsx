/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap, Loader2, ChevronRight, CircleCheck, CircleAlert } from 'lucide-react';
import i18n from '@/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useSchemaStore } from '@/stores/schemaStore';
import { useAccountStore } from '@/stores/accountStore';
import { resolveObject, resolveSchema, resolveVariantForm } from '@/lib/schemaResolver';
import { SECRET_MASK } from '@/lib/jmapUtils';
import { jmapSet, getAccountId } from '@/services/jmap/client';
import { FieldWidget } from '@/components/forms/FieldWidget';
import { DynamicView } from '@/components/views/DynamicView';
import type { Schema, ObjectVariant } from '@/types/schema';
import type { JmapSetResponse } from '@/types/jmap';
import { ExplainButton } from '@/features/ai/explain/ExplainButton';
import { spamVerdictSubject } from '@/features/ai/explain/explain';

type ActionState =
  | { kind: 'pick' }
  | { kind: 'form'; variant: ObjectVariant; formData: Record<string, unknown> }
  | { kind: 'submitting'; variant: ObjectVariant }
  | {
      kind: 'result';
      variant: ObjectVariant;
      props: Record<string, unknown> | null;
      inputData: Record<string, unknown>;
    }
  | { kind: 'error'; variant: ObjectVariant; error: string };

interface ActionPageProps {
  viewName: string;
}

export function ActionPage({ viewName }: ActionPageProps) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const [state, setState] = useState<ActionState>({ kind: 'pick' });

  const resolved = useMemo(() => {
    if (!schema) return null;
    return resolveObject(schema, viewName);
  }, [schema, viewName]);

  const sch = useMemo(() => {
    if (!schema || !resolved) return null;
    return resolveSchema(schema, resolved.objectName);
  }, [schema, resolved]);

  const canCreate = resolved ? hasObjectPermission(resolved.permissionPrefix, 'Create') : false;

  const groups = useMemo(() => {
    const variants = sch?.type === 'multiple' ? sch.variants : [];
    const map = new Map<string, ObjectVariant[]>();
    const otherLabel = t('actions.otherGroup', 'Other');
    for (const v of variants) {
      if (!hasPermission(`action${v.name}`)) continue;
      const colonIdx = v.label.indexOf(':');
      const group = colonIdx > 0 ? v.label.slice(0, colonIdx).trim() : otherLabel;
      let list = map.get(group);
      if (!list) {
        list = [];
        map.set(group, list);
      }
      list.push(v);
    }
    return map;
  }, [sch, hasPermission, t]);

  const list = schema?.lists[viewName] ?? schema?.lists[resolved?.objectName ?? ''];
  const title = list?.title ?? t('actions.title', 'Actions');
  const subtitle = list?.subtitle ?? resolved?.objectType?.description;

  const handlePickVariant = useCallback(
    (variant: ObjectVariant) => {
      if (!schema || !resolved) return;
      if (!variant.schemaName) {
        executeAction(schema, resolved.objectName, variant.name, {}, setState);
      } else {
        const fieldsDef = schema.fields[variant.schemaName!];
        const defaults = fieldsDef?.defaults ? { ...fieldsDef.defaults } : {};
        setState({ kind: 'form', variant, formData: defaults });
      }
    },
    [schema, resolved],
  );

  const handleSubmitForm = useCallback(
    async (variant: ObjectVariant, formData: Record<string, unknown>) => {
      if (!schema || !resolved) return;
      setState({ kind: 'submitting', variant });

      const fields = variant.schemaName ? schema.fields[variant.schemaName] : null;
      const payload: Record<string, unknown> = { '@type': variant.name };

      if (fields) {
        for (const [name, def] of Object.entries(fields.properties)) {
          if (def.update === 'serverSet') continue;
          if (name in formData) {
            const isSecret =
              def.type.type === 'string' && (def.type.format === 'secret' || def.type.format === 'secretText');
            if (isSecret && formData[name] === SECRET_MASK) continue;
            payload[name] = formData[name];
          }
        }
      }

      try {
        const accountId = getAccountId(resolved.objectName);
        const responses = await jmapSet(resolved.objectName, accountId, {
          create: { 'action-0': payload },
        });
        const setResponse = responses[responses.length - 1];
        const setResult = setResponse[1] as unknown as JmapSetResponse;

        if (setResult.created && setResult.created['action-0']) {
          const created = setResult.created['action-0'];
          const noisyKeys = new Set(['id', 'blobId']);
          const extraKeys = Object.keys(created).filter((k) => !noisyKeys.has(k));
          if (extraKeys.length > 0) {
            const extra: Record<string, unknown> = {};
            for (const k of extraKeys) extra[k] = created[k];
            setState({ kind: 'result', variant, props: extra, inputData: formData });
          } else {
            setState({ kind: 'result', variant, props: null, inputData: formData });
          }
        } else if (setResult.notCreated && setResult.notCreated['action-0']) {
          const err = setResult.notCreated['action-0'];
          setState({
            kind: 'error',
            variant,
            error: (err as { description?: string }).description ?? t('actions.actionFailed', 'Action failed.'),
          });
        } else {
          setState({ kind: 'result', variant, props: null, inputData: formData });
        }
      } catch (e) {
        setState({
          kind: 'error',
          variant,
          error: e instanceof Error ? e.message : t('actions.actionFailed', 'Action failed.'),
        });
      }
    },
    [schema, resolved, t],
  );

  if (!schema || !resolved || !sch) return null;

  if (state.kind === 'pick') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="space-y-6">
          {Array.from(groups.entries()).map(([group, groupVariants]) => (
            <div key={group}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">{group}</h3>
              <div className="grid gap-2 sm:grid-cols-2">
                {groupVariants.map((v) => {
                  const colonIdx = v.label.indexOf(':');
                  const actionName = colonIdx > 0 ? v.label.slice(colonIdx + 1).trim() : v.label;
                  return (
                    <Button
                      key={v.name}
                      variant="outline"
                      className="justify-between h-auto py-3 px-4"
                      disabled={!canCreate}
                      onClick={() => handlePickVariant(v)}
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span>{actionName}</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (state.kind === 'form') {
    return (
      <ActionFormView
        schema={schema}
        variant={state.variant}
        formData={state.formData}
        onSubmit={(data) => handleSubmitForm(state.variant, data)}
        onBack={() => setState({ kind: 'pick' })}
      />
    );
  }

  if (state.kind === 'submitting') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground">
          {t('actions.executing', 'Executing {{label}}...', { label: state.variant.label })}
        </p>
      </div>
    );
  }

  if (state.kind === 'result') {
    return (
      <ActionResultView
        schema={schema}
        variant={state.variant}
        props={state.props}
        inputData={state.inputData}
        onNewAction={() => setState({ kind: 'pick' })}
      />
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="mx-auto max-w-xl space-y-4 pt-8">
        <Card>
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <CircleAlert className="h-5 w-5 text-destructive shrink-0" />
              <div>
                <p className="font-medium">{t('actions.failedTitle', 'Action failed')}</p>
                <p className="text-sm text-muted-foreground mt-1">{state.error}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setState({ kind: 'pick' })}>
                {t('actions.backToActions', 'Back to actions')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}

async function executeAction(
  schema: Schema,
  objectName: string,
  variantName: string,
  formData: Record<string, unknown>,
  setState: React.Dispatch<React.SetStateAction<ActionState>>,
) {
  const variant = { name: variantName, label: variantName } as ObjectVariant;
  setState({ kind: 'submitting', variant });

  try {
    const accountId = getAccountId(objectName);
    const payload: Record<string, unknown> = { '@type': variantName, ...formData };
    const responses = await jmapSet(objectName, accountId, {
      create: { 'action-0': payload },
    });
    const setResponse = responses[responses.length - 1];
    const setResult = setResponse[1] as unknown as JmapSetResponse;

    const sch = resolveSchema(schema, objectName);
    const realVariant =
      sch?.type === 'multiple' ? (sch.variants.find((v) => v.name === variantName) ?? variant) : variant;

    if (setResult.created && setResult.created['action-0']) {
      const created = setResult.created['action-0'];
      const noisyKeys = new Set(['id', 'blobId']);
      const extraKeys = Object.keys(created).filter((k) => !noisyKeys.has(k));
      if (extraKeys.length > 0) {
        const extra: Record<string, unknown> = {};
        for (const k of extraKeys) extra[k] = created[k];
        setState({ kind: 'result', variant: realVariant, props: extra, inputData: formData });
      } else {
        setState({ kind: 'result', variant: realVariant, props: null, inputData: formData });
      }
    } else if (setResult.notCreated && setResult.notCreated['action-0']) {
      const err = setResult.notCreated['action-0'];
      setState({
        kind: 'error',
        variant: realVariant,
        error: (err as { description?: string }).description ?? i18n.t('actions.actionFailed', 'Action failed.'),
      });
    } else {
      setState({ kind: 'result', variant: realVariant, props: null, inputData: formData });
    }
  } catch (e) {
    setState({
      kind: 'error',
      variant,
      error: e instanceof Error ? e.message : i18n.t('actions.actionFailed', 'Action failed.'),
    });
  }
}

function ActionFormView({
  schema,
  variant,
  formData: initialData,
  onSubmit,
  onBack,
}: {
  schema: Schema;
  variant: ObjectVariant;
  formData: Record<string, unknown>;
  onSubmit: (data: Record<string, unknown>) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Record<string, unknown>>(initialData);
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!variant.schemaName) return null;
  const fields = schema.fields[variant.schemaName];
  const form = resolveVariantForm(schema, '', '', variant.schemaName);
  if (!fields || !form) return null;

  const mutableSections = form.sections
    .map((section) => ({
      ...section,
      fields: section.fields.filter((ff) => {
        const def = fields.properties[ff.name];
        return def && def.update === 'mutable';
      }),
    }))
    .filter((s) => s.fields.length > 0);

  const handleChange = (fieldName: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [fieldName]: value }));
    setErrors((prev) => {
      const copy = { ...prev };
      delete copy[fieldName];
      return copy;
    });
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    for (const section of mutableSections) {
      for (const ff of section.fields) {
        const def = fields.properties[ff.name];
        if (!def) continue;
        const isRequired =
          (def.type.type === 'string' ||
            def.type.type === 'number' ||
            def.type.type === 'enum' ||
            def.type.type === 'objectId') &&
          !('nullable' in def.type && def.type.nullable);
        if (isRequired) {
          const val = formData[ff.name];
          if (val === undefined || val === null || val === '') {
            newErrors[ff.name] = t('form.required', 'This field is required.');
          }
        }
      }
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    onSubmit(formData);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onBack}>
          {t('common.back', 'Back')}
        </Button>
        <h1 className="text-xl font-semibold">{variant.label}</h1>
      </div>

      {mutableSections.map((section, si) => (
        <Card key={si}>
          {section.title && (
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{section.title}</CardTitle>
            </CardHeader>
          )}
          <CardContent className={section.title ? 'pt-0' : ''}>
            <div className="space-y-4">
              {section.fields.map((ff) => {
                const def = fields.properties[ff.name];
                if (!def) return null;
                return (
                  <FieldWidget
                    key={ff.name}
                    formField={ff}
                    field={def}
                    value={formData[ff.name]}
                    onChange={(v) => handleChange(ff.name, v)}
                    readOnly={false}
                    schema={schema}
                    error={errors[ff.name]}
                  />
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onBack}>
          {t('common.cancel', 'Cancel')}
        </Button>
        <Button onClick={handleSubmit}>
          <Zap className="mr-2 h-4 w-4" />
          {t('actions.execute', 'Execute')}
        </Button>
      </div>
    </div>
  );
}

function ActionResultView({
  schema,
  variant,
  props,
  inputData,
  onNewAction,
}: {
  schema: Schema;
  variant: ObjectVariant;
  props: Record<string, unknown> | null;
  inputData: Record<string, unknown>;
  onNewAction: () => void;
}) {
  const { t } = useTranslation();
  const mergedData = useMemo(() => ({ ...inputData, ...(props ?? {}) }), [inputData, props]);
  const hasData = variant.schemaName && Object.keys(mergedData).length > 0;

  const visibleFields = useMemo(() => new Set(Object.keys(mergedData)), [mergedData]);

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
          data={mergedData}
          visibleFields={visibleFields}
        />
      )}

      {/* inbuxa: "Explain this" for a spam verdict (ai-explain EX-17) */}
      {variant.name === 'ClassifySpam' && props && (
        <ExplainButton
          subject={() => spamVerdictSubject(props)}
          title={t('explain.spamVerdictTitle', 'Spam verdict: {{result}}', { result: String(props.result ?? '') })}
        />
      )}

      {!hasData && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            {t('actions.noAdditionalData', 'No additional data returned.')}
          </CardContent>
        </Card>
      )}

      <Button onClick={onNewAction}>
        <Zap className="mr-2 h-4 w-4" />
        {t('actions.executeAnother', 'Execute another action')}
      </Button>
    </div>
  );
}
