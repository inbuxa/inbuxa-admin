/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, it } from 'vitest';
import { showsTenantCertificateNote } from './tenantNames';

const automatic = { '@type': 'Automatic', acmeProviderId: 'a', subjectAlternativeNames: {} };

describe('showsTenantCertificateNote', () => {
  it('shows for a tenant’s domain with automatic certificates', () => {
    expect(showsTenantCertificateNote({ certificateManagement: automatic, memberTenantId: 'b' }, true)).toBe(true);
  });

  it('shows inside a tenant, where the server leaves the tenant out', () => {
    expect(showsTenantCertificateNote({ certificateManagement: automatic }, false)).toBe(true);
  });

  it('stays away from a server administrator’s own domains', () => {
    expect(showsTenantCertificateNote({ certificateManagement: automatic }, true)).toBe(false);
    expect(showsTenantCertificateNote({ certificateManagement: automatic, memberTenantId: null }, true)).toBe(false);
    expect(showsTenantCertificateNote({ certificateManagement: automatic, memberTenantId: '' }, true)).toBe(false);
  });

  it('stays away from manual certificates', () => {
    expect(
      showsTenantCertificateNote({ certificateManagement: { '@type': 'Manual' }, memberTenantId: 'b' }, false),
    ).toBe(false);
    expect(showsTenantCertificateNote({ memberTenantId: 'b' }, false)).toBe(false);
  });
});
