/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: starting points for the directories people actually run
 * (settings-reorg, guided setup "Connect a sign-in directory"). They're
 * starting points, not guarantees: every schema is set up a little
 * differently, which is why the guide tests a real person before any
 * domain signs in through the directory.
 */

export type Flavor = 'ad' | 'openldap' | 'freeipa' | 'keycloak' | 'authentik' | 'oidc';
export type Kind = 'Ldap' | 'Oidc';

export interface Preset {
  id: Flavor;
  kind: Kind;
  name: string;
  hint: string;
  /** Example values for the connection fields. */
  example: { url?: string; baseDn?: string; bindDn?: string; issuer?: string };
  /** Directory fields the preset sets, in the server's JSON form. */
  fields: Record<string, unknown>;
}

const set = (...values: string[]) => Object.fromEntries(values.map((v) => [v, true]));

export const PRESETS: Preset[] = [
  {
    id: 'ad',
    kind: 'Ldap',
    name: 'Active Directory',
    hint: 'Windows Server or Samba AD. People sign in with their email address or user principal name.',
    example: {
      url: 'ldaps://dc1.corp.example:636',
      baseDn: 'dc=corp,dc=example',
      bindDn: 'cn=inbuxa,cn=Users,dc=corp,dc=example',
    },
    fields: {
      filterLogin: '(&(objectClass=user)(|(mail=?)(userPrincipalName=?)))',
      filterMailbox: '(|(&(objectClass=user)(mail=?))(&(objectClass=group)(mail=?)))',
      filterMemberOf: null,
      groupClass: 'group',
      attrClass: set('objectClass'),
      attrEmail: set('mail'),
      attrEmailAlias: set('otherMailbox'),
      attrDescription: set('displayName'),
      attrMemberOf: set('memberOf'),
      attrSecret: {},
      attrSecretChanged: set('pwdLastSet'),
      bindAuthentication: true,
    },
  },
  {
    id: 'openldap',
    kind: 'Ldap',
    name: 'OpenLDAP',
    hint: 'inetOrgPerson accounts with mail and mailAlias, groupOfNames groups.',
    example: { url: 'ldaps://ldap.example.org:636', baseDn: 'dc=example,dc=org', bindDn: 'cn=admin,dc=example,dc=org' },
    fields: {
      filterLogin: '(&(objectClass=inetOrgPerson)(mail=?))',
      filterMailbox:
        '(|(&(objectClass=inetOrgPerson)(|(mail=?)(mailAlias=?)))(&(objectClass=groupOfNames)(|(mail=?)(mailAlias=?))))',
      filterMemberOf: '(&(objectClass=groupOfNames)(member=?))',
      groupClass: 'groupOfNames',
      attrClass: set('objectClass'),
      attrEmail: set('mail'),
      attrEmailAlias: set('mailAlias'),
      attrDescription: set('cn'),
      attrMemberOf: set('memberOf'),
      attrSecret: {},
      attrSecretChanged: set('pwdChangedTime'),
      bindAuthentication: true,
    },
  },
  {
    id: 'freeipa',
    kind: 'Ldap',
    name: 'FreeIPA',
    hint: 'Red Hat Identity Management. Accounts live under cn=accounts.',
    example: {
      url: 'ldaps://ipa.example.org:636',
      baseDn: 'cn=accounts,dc=example,dc=org',
      bindDn: 'uid=inbuxa,cn=sysaccounts,cn=etc,dc=example,dc=org',
    },
    fields: {
      filterLogin: '(&(objectClass=person)(mail=?))',
      filterMailbox: '(|(&(objectClass=person)(mail=?))(&(objectClass=groupOfNames)(mail=?)))',
      filterMemberOf: null,
      groupClass: 'groupOfNames',
      attrClass: set('objectClass'),
      attrEmail: set('mail'),
      attrEmailAlias: {},
      attrDescription: set('cn'),
      attrMemberOf: set('memberOf'),
      attrSecret: {},
      attrSecretChanged: set('krbLastPwdChange'),
      bindAuthentication: true,
    },
  },
  {
    id: 'keycloak',
    kind: 'Oidc',
    name: 'Keycloak',
    hint: 'A realm’s OpenID Connect issuer. Sign-in happens at Keycloak; mail apps use tokens or app passwords.',
    example: { issuer: 'https://sso.example.org/realms/example' },
    fields: { claimUsername: 'email', claimName: 'name', claimGroups: 'groups' },
  },
  {
    id: 'authentik',
    kind: 'Oidc',
    name: 'Authentik',
    hint: 'An Authentik OAuth2/OpenID provider’s issuer.',
    example: { issuer: 'https://auth.example.org/application/o/inbuxa/' },
    fields: { claimUsername: 'email', claimName: 'name', claimGroups: 'groups' },
  },
  {
    id: 'oidc',
    kind: 'Oidc',
    name: 'Another OpenID Connect provider',
    hint: 'Any provider with a discovery document at /.well-known/openid-configuration.',
    example: { issuer: 'https://id.example.org' },
    fields: { claimUsername: 'email', claimName: 'name' },
  },
];

export function presetById(id: Flavor): Preset {
  return PRESETS.find((p) => p.id === id)!;
}

export interface Connection {
  url: string;
  baseDn: string;
  bindDn: string;
  /** Empty keeps the saved one when editing. */
  bindPassword: string;
  allowInvalidCerts: boolean;
  issuer: string;
  usernameDomain: string;
}

/** The x:Directory object this preset and connection make. */
export function directoryObject(p: Preset, c: Connection, description: string): Record<string, unknown> {
  if (p.kind === 'Oidc') {
    return {
      '@type': 'Oidc',
      description,
      issuerUrl: c.issuer.trim(),
      usernameDomain: c.usernameDomain.trim() || null,
      ...p.fields,
    };
  }
  const url = c.url.trim();
  return {
    '@type': 'Ldap',
    description,
    url,
    // ldaps:// is encrypted by the URL itself; useTls asks for STARTTLS on ldap://.
    useTls: url.startsWith('ldap://') && !/^ldap:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(url),
    allowInvalidCerts: c.allowInvalidCerts,
    baseDn: c.baseDn.trim(),
    bindDn: c.bindDn.trim() || null,
    ...(c.bindPassword ? { bindSecret: { '@type': 'Value', secret: c.bindPassword } } : {}),
    ...p.fields,
  };
}
