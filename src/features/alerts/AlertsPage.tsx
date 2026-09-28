/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { DynamicList } from '@/components/lists/DynamicList';
import { AlertTemplates } from './AlertTemplates';

/** Monitoring › Alerts: the alerts in words and the templates, then the list, refreshed when one is added. */
export function AlertsPage({ viewName }: { viewName: string }) {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-4">
      <AlertTemplates onCreated={() => setVersion((v) => v + 1)} />
      <DynamicList key={version} viewName={viewName} />
    </div>
  );
}
