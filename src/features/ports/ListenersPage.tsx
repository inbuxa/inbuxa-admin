/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { DynamicList } from '@/components/lists/DynamicList';
import { PortsTable } from './PortsTable';
import { ReachabilityCard } from './ReachabilityCard';

/** Network › Listeners: the standard ports as a table, whether they're reachable, then every listener, refreshed on a change. */
export function ListenersPage({ viewName }: { viewName: string }) {
  const [version, setVersion] = useState(0);
  return (
    <div className="space-y-4">
      <PortsTable onChanged={() => setVersion((v) => v + 1)} />
      <ReachabilityCard key={`reach-${version}`} />
      <DynamicList key={version} viewName={viewName} />
    </div>
  );
}
