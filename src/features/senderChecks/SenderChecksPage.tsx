/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { SenderChecksLevels } from './SenderChecksLevels';

/** Sender checks: the level choice, then the full form, reloaded when a level is applied. */
export function SenderChecksPage({ viewName }: { viewName: string }) {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-4">
      <SenderChecksLevels onApplied={() => setVersion((v) => v + 1)} />
      <DynamicForm key={version} viewName={viewName} objectId="singleton" />
    </div>
  );
}
