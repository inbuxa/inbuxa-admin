/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { directoryObject, presetById, type Connection } from './presets';

const conn: Connection = {
  url: 'ldaps://dc1.corp.example:636',
  baseDn: 'dc=corp,dc=example',
  bindDn: 'cn=inbuxa,cn=Users,dc=corp,dc=example',
  bindPassword: 'pw',
  allowInvalidCerts: false,
  issuer: '',
  usernameDomain: '',
};

describe('directoryObject', () => {
  it('builds an LDAP directory with the preset filters and the bind secret', () => {
    const o = directoryObject(presetById('ad'), conn, 'AD');
    expect(o).toMatchObject({
      '@type': 'Ldap',
      url: 'ldaps://dc1.corp.example:636',
      useTls: false,
      baseDn: 'dc=corp,dc=example',
      bindSecret: { '@type': 'Value', secret: 'pw' },
      groupClass: 'group',
    });
  });

  it('asks for STARTTLS on ldap:// except to this machine', () => {
    expect(directoryObject(presetById('openldap'), { ...conn, url: 'ldap://ldap.example.org' }, '').useTls).toBe(true);
    expect(directoryObject(presetById('openldap'), { ...conn, url: 'ldap://localhost' }, '').useTls).toBe(false);
  });

  it('keeps the saved bind secret when no password is typed', () => {
    expect(directoryObject(presetById('openldap'), { ...conn, bindPassword: '' }, '')).not.toHaveProperty('bindSecret');
  });

  it('builds an OIDC directory from the issuer', () => {
    expect(
      directoryObject(presetById('keycloak'), { ...conn, issuer: ' https://sso.example.org/realms/x ' }, 'KC'),
    ).toEqual({
      '@type': 'Oidc',
      description: 'KC',
      issuerUrl: 'https://sso.example.org/realms/x',
      usernameDomain: null,
      claimUsername: 'email',
      claimName: 'name',
      claimGroups: 'groups',
    });
  });
});
