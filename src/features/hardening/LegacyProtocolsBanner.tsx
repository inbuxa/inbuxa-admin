/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the banner while legacy mail protocols are off (LP-18), on the
 * Security settings and the dashboard. It says nothing when the switch is on,
 * when the reader may not see the policy, or when the server has no policy.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { useAccountStore } from '@/stores/accountStore';
import { fetchProtocolPolicy, fetchTenantPolicy } from './protocolPolicy';

export const LEGACY_PROTOCOLS_VIEW = 'CustomComponent/LegacyProtocols';

export function LegacyProtocolsBanner() {
  const { t } = useTranslation();
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

  if (!off) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
      <span>
        {t('legacyProtocols.bannerLead', 'Legacy mail protocols are')}{' '}
        <strong>{t('legacyProtocols.bannerOff', 'off')}</strong>{' '}
        {off === 'server'
          ? t('legacyProtocols.bannerTail', 'on this server. Only INBUXA webmail and JMAP apps can sign in.')
          : t(
              'legacyProtocols.bannerTailTenant',
              'for your organization. Only INBUXA webmail and JMAP apps can sign in.',
            )}
      </span>
      {off === 'server' && (
        <Link to={`/Settings/${LEGACY_PROTOCOLS_VIEW}`} className="font-medium text-primary hover:underline">
          {t('legacyProtocols.review', 'Review')}
        </Link>
      )}
    </div>
  );
}
