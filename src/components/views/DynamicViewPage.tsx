/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { resolveList, resolveObject } from '@/lib/schemaResolver';
import { getAccountId, jmapGet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';

import { DynamicView } from './DynamicView';
import { recordFrom, recordTitle } from './recordView';

interface DynamicViewPageProps {
  viewName: string;
  objectId: string;
}

/** One record, read-only, for an account that may see it but not change it. */
export function DynamicViewPage({ viewName, objectId }: DynamicViewPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const schema = useSchemaStore((s) => s.schema);
  const [record, setRecord] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!schema) return;
    let live = true;
    (async () => {
      try {
        const resolved = resolveObject(schema, viewName);
        if (!resolved) throw new Error(t('view.couldNotResolve', 'Could not resolve object'));
        const responses = await jmapGet(resolved.objectName, getAccountId(resolved.objectName), [objectId]);
        if (live) setRecord(recordFrom(responses, t));
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : t('view.failedToLoad', 'Failed to load'));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [schema, viewName, objectId, t]);

  const back = (
    <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
      <ArrowLeft className="mr-2 h-4 w-4" />
      {t('common.back', 'Back')}
    </Button>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !record || !schema) {
    return (
      <div className="space-y-4">
        {back}
        <div className="text-destructive p-4">{error ?? t('view.failedToLoad', 'Failed to load')}</div>
      </div>
    );
  }

  const resolved = resolveObject(schema, viewName);
  if (!resolved) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        {back}
        <h1 className="text-xl font-semibold">
          {recordTitle(resolveList(schema, viewName, resolved.objectName), resolved.objectName, record)}
        </h1>
      </div>
      <DynamicView schema={schema} objectName={resolved.objectName} viewName={viewName} data={record} />
    </div>
  );
}
