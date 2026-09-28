/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { ReportsSheet } from './ReportsSheet';

/** A report page: the page heading, what goes out and comes in, then this page's own settings folded underneath and reloaded after a save. */
export function ReportsPage({ viewName }: { viewName: string }) {
  const { t } = useTranslation();
  const [version, setVersion] = useState(0);
  return (
    <DynamicForm
      key={version}
      viewName={viewName}
      objectId="singleton"
      intro={<ReportsSheet onSaved={() => setVersion((v) => v + 1)} />}
      foldSections={t('reports.more', 'Names, subjects and every setting on this page')}
    />
  );
}
