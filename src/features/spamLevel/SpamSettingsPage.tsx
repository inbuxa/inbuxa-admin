/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { DynamicForm } from '@/components/forms/DynamicForm';
import { SpamLevels } from './SpamLevels';

/** Spam filter › General: the page heading, how hard the filter is, then the full form, reloaded after a save. */
export function SpamSettingsPage({ viewName }: { viewName: string }) {
  const [version, setVersion] = useState(0);
  return (
    <DynamicForm
      key={version}
      viewName={viewName}
      objectId="singleton"
      intro={<SpamLevels onApplied={() => setVersion((v) => v + 1)} />}
    />
  );
}
