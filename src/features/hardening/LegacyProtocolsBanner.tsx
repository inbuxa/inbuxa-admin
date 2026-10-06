/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the banner while legacy mail protocols are off (LP-18), on the
 * Security settings and the dashboard. It says nothing when the switch is on,
 * when the reader may not see the policy, or when the server has no policy.
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ShieldCheck } from 'lucide-react';
import { useLegacyProtocolsOff } from './useLegacyProtocolsOff';

export const LEGACY_PROTOCOLS_VIEW = 'CustomComponent/LegacyProtocols';

export function LegacyProtocolsBanner() {
  const { t } = useTranslation();
  const off = useLegacyProtocolsOff();
  if (!off) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm">
      <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />
      <span>
        {t('legacyProtocols.bannerLead', 'Legacy mail protocols are')}{' '}
        <strong>{t('legacyProtocols.bannerOff', 'off')}</strong>{' '}
        {off === 'server'
          ? t('legacyProtocols.bannerTail', 'on this server. Only inbuxa webmail and JMAP apps can sign in.')
          : t(
              'legacyProtocols.bannerTailTenant',
              'for your organization. Only inbuxa webmail and JMAP apps can sign in.',
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
