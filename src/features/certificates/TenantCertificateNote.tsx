/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';

/** inbuxa: under a tenant's domain's certificate settings, which names it may have (#268). */
export function TenantCertificateNote() {
  const { t } = useTranslation();
  return (
    <p role="note" className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
      {t(
        'certificates.tenantNames.note',
        'On a tenant’s domain, the certificate can name only the domain itself, names under it, and names under the tenant’s other verified domains and aliases. A name with no dot, like mail, goes under the domain. A new domain gets its certificate once it’s verified: until then the order fails, so save these settings again after verifying. If an older domain lists a name that isn’t allowed, other changes to it are refused until you remove that name.',
      )}
    </p>
  );
}
