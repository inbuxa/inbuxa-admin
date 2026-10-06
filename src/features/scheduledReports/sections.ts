/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/** inbuxa: each report section's name and what it contains (RP-1 to RP-8). */

import { useTranslation } from 'react-i18next';
import type { SectionName } from './api';

export function useSectionLabels(): Record<SectionName, { label: string; hint: string }> {
  const { t } = useTranslation();
  return {
    mailFlow: {
      label: t('schedRep.s.mailFlow', 'Mail flow'),
      hint: t(
        'schedRep.s.mailFlowHint',
        'Messages received, sent, delivered as spam and bounced, and the average delivery time.',
      ),
    },
    queue: {
      label: t('schedRep.s.queue', 'Queue'),
      hint: t('schedRep.s.queueHint', 'Messages still waiting to be delivered at the end of the period.'),
    },
    spoofing: {
      label: t('schedRep.s.spoofing', 'Mail pretending to be you'),
      hint: t(
        'schedRep.s.spoofingHint',
        'From received DMARC reports: messages that used your domains and couldn’t prove it, and where they came from.',
      ),
    },
    tlsFailures: {
      label: t('schedRep.s.tlsFailures', 'Secure delivery to you'),
      hint: t(
        'schedRep.s.tlsFailuresHint',
        'From received TLS reports: deliveries to your domains that couldn’t be encrypted, and why.',
      ),
    },
    deliverability: {
      label: t('schedRep.s.deliverability', 'Deliverability'),
      hint: t(
        'schedRep.s.deliverabilityHint',
        'Blocklists, reverse DNS, SPF, DKIM and MTA-STS problems, and what changed since the last report.',
      ),
    },
    security: {
      label: t('schedRep.s.security', 'Security'),
      hint: t('schedRep.s.securityHint', 'Failed sign-ins, bans and blocked addresses.'),
    },
    storage: {
      label: t('schedRep.s.storage', 'Storage'),
      hint: t(
        'schedRep.s.storageHint',
        'People at 90% or more of their storage, with their addresses, and people and domains added or removed.',
      ),
    },
    certificates: {
      label: t('schedRep.s.certificates', 'Certificates'),
      hint: t('schedRep.s.certificatesHint', 'Certificates that expire within 21 days.'),
    },
  };
}
