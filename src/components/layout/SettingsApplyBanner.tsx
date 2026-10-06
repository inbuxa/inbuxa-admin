/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: shown when saved settings are stored but the server couldn't apply
 * them. It stays until they are applied or it is dismissed, names the object
 * the server couldn't build and links to it, and offers to try again.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { humanize } from '@/lib/humanize';
import { resolveList } from '@/lib/schemaResolver';
import { useSchemaStore } from '@/stores/schemaStore';
import { useSettingsApplyStore } from '@/stores/settingsApplyStore';

export function SettingsApplyBanner() {
  const { t } = useTranslation();
  const failure = useSettingsApplyStore((s) => s.failure);
  const applying = useSettingsApplyStore((s) => s.applying);
  const applyNow = useSettingsApplyStore((s) => s.applyNow);
  const dismiss = useSettingsApplyStore((s) => s.dismiss);
  const schema = useSchemaStore((s) => s.schema);
  const viewToSection = useSchemaStore((s) => s.viewToSection);

  if (!failure) return null;

  let objectLabel: string | null = null;
  let objectLink: string | null = null;
  if (failure.object) {
    const objectName = `x:${failure.object.object}`;
    const objectType = schema?.objects[objectName];
    const list = schema ? resolveList(schema, objectName, objectName) : null;
    objectLabel = list?.singularName ?? humanize(failure.object.object);
    const section = viewToSection[objectName];
    if (section) {
      objectLink =
        objectType?.type === 'singleton' || failure.object.id === 'singleton'
          ? `/${section}/${objectName}`
          : `/${section}/${objectName}/${encodeURIComponent(failure.object.id)}`;
    }
  }

  return (
    <div
      role="alert"
      className="mb-4 flex flex-wrap items-start gap-x-3 gap-y-2 rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="font-medium">
          {t('settingsApply.failed', "Saved, but the server couldn't apply the settings: {{reason}}", {
            reason: failure.message,
          })}
        </p>
        {objectLabel && (
          <p className="text-muted-foreground">
            {t('settingsApply.failedObject', 'The problem is in {{object}}.', { object: objectLabel })}{' '}
            {objectLink && (
              <Link to={objectLink} className="font-medium text-primary hover:underline">
                {t('settingsApply.openObject', 'Open it')}
              </Link>
            )}
          </p>
        )}
        <p className="text-muted-foreground">
          {t(
            'settingsApply.stillRunning',
            'The server keeps running on the settings it had. Your changes are saved and apply once this is fixed.',
          )}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => void applyNow()} disabled={applying}>
          {applying && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
          {t('settingsApply.applyNow', 'Apply now')}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8"
          onClick={dismiss}
          aria-label={t('settingsApply.dismiss', 'Dismiss')}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
