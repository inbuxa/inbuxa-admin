/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useState } from 'react';
import { useAccountStore } from '@/stores/accountStore';
import { fetchProtocolPolicy, fetchTenantPolicy } from './protocolPolicy';

/** Whether legacy protocols are off, and where: this server, the reader's tenant, or neither (null). */
export function useLegacyProtocolsOff(): null | 'server' | 'tenant' {
  const canGetServer = useAccountStore((s) => s.hasObjectPermission('sysNetworkListener', 'Get'));
  const canGetTenant = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Get'));
  const [off, setOff] = useState<null | 'server' | 'tenant'>(null);

  useEffect(() => {
    if (!canGetServer && !canGetTenant) return;
    const controller = new AbortController();
    const signal = controller.signal;
    (async () => {
      // The server's switch first. Inside a tenant it can't be read, and the
      // tenant's own is the one to report (LP-18 at tenant scope).
      try {
        if (canGetServer) {
          const policy = await fetchProtocolPolicy(signal);
          if (!signal.aborted) setOff(policy.legacyProtocols === 'disabled' ? 'server' : null);
          return;
        }
      } catch {
        // Fall through to the tenant's.
      }
      try {
        if (canGetTenant) {
          const policy = await fetchTenantPolicy(null, signal);
          if (!signal.aborted) setOff(policy.legacyProtocols === 'disabled' ? 'tenant' : null);
        }
      } catch {
        // A banner is not worth an error: an older server simply has no switch.
      }
    })();
    return () => controller.abort();
  }, [canGetServer, canGetTenant]);

  return off;
}
