/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { SpamLevels } from './SpamLevels';

/** Spam filter › General: the level and switches, then the full form, reloaded after a save. */
export function SpamSettingsPage({ viewName }: { viewName: string }) {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-4">
      <SpamLevels onApplied={() => setVersion((v) => v + 1)} />
      <DynamicForm key={version} viewName={viewName} objectId="singleton" />
    </div>
  );
}
