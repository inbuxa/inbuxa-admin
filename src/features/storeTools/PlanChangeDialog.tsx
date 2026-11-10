/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: planning a blob store change ahead (inbuxa-server
 * docs/spec/features/blob-store-copy-ahead.md, CA-1). The new store's
 * settings are the blob store setting's own fields, sent as `target`; the
 * server opens the store and writes a probe before it records the plan.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FieldWidget } from '@/components/forms/FieldWidget';
import { buildNewObjectValue, resolveSchema } from '@/lib/schemaResolver';
import { useSchemaStore } from '@/stores/schemaStore';
import { toast } from '@/hooks/use-toast';
import type { Form } from '@/types/schema';
import { planChange } from './api';

const BLOB_STORE = 'x:BlobStore';

export function PlanChangeDialog({ onClose, onPlanned }: { onClose: () => void; onPlanned: () => void }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const resolved = useMemo(() => (schema ? resolveSchema(schema, BLOB_STORE) : null), [schema]);
  const variants = resolved?.type === 'multiple' ? resolved.variants : [];
  const [variant, setVariant] = useState(variants[0]?.name ?? '');
  const [settings, setSettings] = useState<Record<string, unknown>>(() =>
    schema && variant ? buildNewObjectValue(schema, BLOB_STORE, variant) : {},
  );
  const [refusal, setRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const current = variants.find((v) => v.name === variant);
  const form: Form | null = (current?.schemaName && schema?.forms[current.schemaName]) || null;
  const fields = current?.fields ?? null;

  const choose = (name: string) => {
    setVariant(name);
    setRefusal(null);
    if (schema) setSettings(buildNewObjectValue(schema, BLOB_STORE, name));
  };

  const plan = async () => {
    setRefusal(null);
    setBusy(true);
    try {
      await planChange({ ...settings, '@type': variant });
      toast({ title: t('blobStoreChange.planned', 'Change planned') });
      onPlanned();
    } catch (e) {
      // The server's refusal says what to fix (CA-1), so it stays beside the fields.
      setRefusal(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('blobStoreChange.planTitle', 'Plan a blob store change')}</DialogTitle>
          <DialogDescription>
            {t(
              'blobStoreChange.planBody',
              'Give the new store’s settings. The server checks it can write there, then copies everything into it while the current store stays the blob store. Mail isn’t written there until you make it the blob store.',
            )}
          </DialogDescription>
        </DialogHeader>

        {!schema || !resolved ? (
          <p className="text-sm text-muted-foreground">
            {t('blobStoreChange.planNoSchema', 'The blob store settings couldn’t be read from this server.')}
          </p>
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">{t('blobStoreChange.planType', 'Store type')}</Label>
              <Select value={variant} onValueChange={choose} disabled={busy}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {variants.map((v) => (
                    <SelectItem key={v.name} value={v.name}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fields &&
              form?.sections.map((section, i) => (
                <div key={i} className="space-y-4">
                  {section.title && <div className="text-sm font-semibold">{section.title}</div>}
                  {section.fields.map((formField) => {
                    const field = fields.properties[formField.name];
                    if (!field || field.update === 'serverSet') return null;
                    return (
                      <FieldWidget
                        key={formField.name}
                        field={field}
                        formField={formField}
                        value={settings[formField.name]}
                        onChange={(value) => setSettings((prev) => ({ ...prev, [formField.name]: value }))}
                        readOnly={busy}
                        schema={schema}
                        helpScope={current?.schemaName}
                      />
                    );
                  })}
                </div>
              ))}
          </div>
        )}

        {refusal && (
          <p role="alert" className="text-sm text-destructive">
            {refusal}
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void plan()} disabled={busy || !resolved || !variant}>
            <CalendarClock className="mr-2 h-4 w-4" />
            {t('blobStoreChange.planGo', 'Plan it')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
