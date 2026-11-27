/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: which names a tenant's domain may put on its certificate (server
 * rc.47, #631). The server refuses any other name on save and leaves
 * unverified ones out of orders; TenantCertificateNote explains that on the
 * domain form (#268).
 */

/**
 * Whether the domain form shows TenantCertificateNote: certificates are automatic and
 * the domain is a tenant's. A server administrator sees the domain's
 * tenant; inside a tenant the server leaves `memberTenantId` out, so an
 * administrator who can't create tenants is taken to be in one.
 */
export function showsTenantCertificateNote(data: Record<string, unknown>, canCreateTenants: boolean): boolean {
  const management = data.certificateManagement as { '@type'?: unknown } | null | undefined;
  if (management?.['@type'] !== 'Automatic') return false;
  const tenant = data.memberTenantId;
  return (typeof tenant === 'string' && tenant !== '') || !canCreateTenants;
}
