/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { ReportsSheet } from './ReportsSheet';

/**
 * A report page: what goes out and what comes in, in a few sentences, then
 * this page's own settings (names, subjects, signing) folded underneath and
 * reloaded after a save.
 */
export function ReportsPage({ viewName }: { viewName: string }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-4">
      <ReportsSheet onSaved={() => setVersion((v) => v + 1)} />
      <Collapsible className="mx-auto max-w-4xl">
        <CollapsibleTrigger className="group flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4 transition-transform group-data-[state=closed]:-rotate-90" />
          {t('reports.more', 'Names, subjects and every setting on this page')}
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <DynamicForm key={version} viewName={viewName} objectId="singleton" />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
