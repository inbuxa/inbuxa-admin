/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { evaluate, normalizeExpr, sameExpr, type Defaults, type Snapshot } from './checks';

const DEFAULTS: Record<string, unknown> = {
  'x:MtaStageRcpt.allowRelaying': { default: '!is_empty(authenticated_as)' },
  'x:MtaStageAuth.require': { default: 'local_port != 25' },
  'x:Security.authBanRate': { count: 100, period: '1d' },
  'x:Security.abuseBanRate': { count: 35, period: '1d' },
  'x:Security.scanBanRate': { count: 30, period: '1d' },
  'x:Http.rateLimitAnonymous': { count: 100, period: '1m' },
  'x:Authentication.passwordMinStrength': 'three',
  'x:Authentication.passwordMinLength': 8,
  'x:SenderAuth.dmarcVerify': { else: 'disable', match: [{ if: 'local_port == 25', then: 'relaxed' }] },
};
const defaults: Defaults = (o, f) => DEFAULTS[`${o}.${f}`];

const NOW = Date.parse('2026-09-29T00:00:00Z');
const DAY = 86_400_000;

/** A server at every default, with DNS live: what a fresh install looks like. */
function fresh(): Snapshot {
  return {
    now: NOW,
    imap: { allowPlainTextAuth: false },
    rcpt: { allowRelaying: { match: {}, else: '!is_empty(authenticated_as)' } },
    auth: { require: { match: {}, else: 'local_port != 25' } },
    certificates: [{ id: 'c1', names: ['mail.example.org'], notValidAfter: new Date(NOW + 80 * DAY).toISOString() }],
    security: { authBanRate: DEFAULTS['x:Security.authBanRate'], abuseBanRate: {}, scanBanRate: {} },
    http: { rateLimitAnonymous: { count: 100, period: '1m' } },
    oidc: { anonymousClientRegistration: false, requireClientRegistration: true },
    authentication: { passwordMinStrength: 'three', passwordMinLength: 8, passwordHashAlgorithm: 'argon2id' },
    tlsStrategies: [{ id: 't1', name: 'default', allowInvalidCerts: false }],
    senderAuth: { dmarcVerify: { match: { 0: { if: 'local_port == 25', then: 'relaxed' } }, else: 'disable' } },
    metrics: { prometheus: { '@type': 'Disabled' } },
    mtaSts: { mode: 'testing' },
    domains: [
      { id: 'd1', name: 'example.org', enabled: true, allowRelaying: false, missing: [], dmarcPolicy: 'reject' },
    ],
    legacyOn: true,
    unavailable: {},
  };
}

const ids = (s: Snapshot) => evaluate(s, defaults).items.map((i) => i.check);

describe('expressions', () => {
  it('read the same whichever shape they come in', () => {
    expect(sameExpr({ default: 'a  == b' }, { match: {}, else: 'a == b' })).toBe(true);
    expect(
      sameExpr({ match: [{ if: 'x', then: 'y' }], else: 'z' }, { match: { 0: { if: 'x', then: 'y' } }, else: 'z' }),
    ).toBe(true);
    expect(normalizeExpr(undefined)).toEqual({ rules: [], else: '' });
  });
});

describe('the checks (acceptance tests 1-8)', () => {
  it('1: a fresh install shows only legacy protocols and MTA-STS', () => {
    expect(ids(fresh())).toEqual(['SS-15', 'SS-17']);
    const tidy = { ...fresh(), legacyOn: false, mtaSts: { mode: 'enforce' } };
    expect(ids(tidy)).toEqual([]);
  });

  it('2: plain-text IMAP is critical, with a one-field fix and its undo', () => {
    const r = evaluate({ ...fresh(), imap: { allowPlainTextAuth: true } }, defaults);
    const item = r.items[0];
    expect(item.check).toBe('SS-1');
    expect(item.severity).toBe('critical');
    expect(item.action).toMatchObject({
      kind: 'fix',
      object: 'x:Imap',
      patch: { allowPlainTextAuth: false },
      undo: { allowPlainTextAuth: true },
    });
  });

  it('3: an edited relaying rule is a Review with both expressions, never a Fix', () => {
    const item = evaluate({ ...fresh(), rcpt: { allowRelaying: { match: {}, else: 'true' } } }, defaults).items[0];
    expect(item.check).toBe('SS-2');
    expect(item.action.kind).toBe('review');
    if (item.action.kind === 'review') {
      expect(item.action.details).toEqual([
        { label: 'Now', value: 'true' },
        { label: 'Default', value: '!is_empty(authenticated_as)' },
      ]);
    }
  });

  it('4: a certificate 5 days from expiry is SS-5, not SS-14; 20 days is SS-14', () => {
    const at = (days: number): Snapshot => ({
      ...fresh(),
      certificates: [
        { id: 'c1', names: ['mail.example.org'], notValidAfter: new Date(NOW + days * DAY).toISOString() },
      ],
    });
    expect(ids(at(5)).filter((c) => c === 'SS-5' || c === 'SS-14')).toEqual(['SS-5']);
    expect(ids(at(20)).filter((c) => c === 'SS-5' || c === 'SS-14')).toEqual(['SS-14']);
    expect(ids(at(-1))).toContain('SS-5');
  });

  it('4b: a certificate a later one covers is a leftover, unless it is the default', () => {
    const iso = (days: number) => new Date(NOW + days * DAY).toISOString();
    const old = { id: 'old', names: ['mail.example.org', 'autoconfig.example.org'], notValidAfter: iso(4) };
    const renewed = {
      id: 'new',
      names: ['MX2.example.org', 'mail.example.org', 'autoconfig.example.org'],
      notValidAfter: iso(80),
    };
    const certChecks = (s: Snapshot) =>
      evaluate(s, defaults).items.filter((i) => i.check === 'SS-5' || i.check === 'SS-14');

    // Covered by a later certificate and not the default: nothing to do.
    expect(certChecks({ ...fresh(), certificates: [old, renewed], defaultCertificateId: null })).toEqual([]);
    expect(certChecks({ ...fresh(), certificates: [old, renewed], defaultCertificateId: 'new' })).toEqual([]);

    // The default couldn't be read: the old one is still listed.
    expect(certChecks({ ...fresh(), certificates: [old, renewed] }).map((i) => i.subject)).toEqual(['old']);

    // A later certificate that misses a name doesn't cover it.
    const partial = { ...renewed, names: ['mail.example.org'] };
    expect(
      certChecks({ ...fresh(), certificates: [old, partial], defaultCertificateId: null }).map((i) => i.subject),
    ).toEqual(['old']);

    // An earlier certificate doesn't cover a later one.
    const earlier = { ...renewed, notValidAfter: iso(2) };
    expect(
      certChecks({ ...fresh(), certificates: [old, earlier], defaultCertificateId: null })
        .map((i) => i.subject)
        .sort(),
    ).toEqual(['new', 'old']);

    // The default is the leftover: one item whose Fix points the default at the later one.
    const [item] = certChecks({ ...fresh(), certificates: [old, renewed], defaultCertificateId: 'old' });
    expect(item.check).toBe('SS-5');
    expect(item.title).toBe('The default certificate expires in 4 days');
    expect(item.action).toMatchObject({
      kind: 'fix',
      object: 'x:SystemSettings',
      patch: { defaultCertificateId: 'new' },
      undo: { defaultCertificateId: 'old' },
    });
  });

  it('5: an empty ban rate is fixed back to its default', () => {
    const item = evaluate({ ...fresh(), security: { authBanRate: null, abuseBanRate: {}, scanBanRate: {} } }, defaults)
      .items[0];
    expect(item.check).toBe('SS-6');
    expect(item.action).toMatchObject({ kind: 'fix', patch: { authBanRate: { count: 100, period: '1d' } } });
  });

  it('6: a part that couldn’t be read is “not checked”, not a to-do item', () => {
    const r = evaluate(
      { ...fresh(), security: undefined, unavailable: { security: 'No permission to read it' } },
      defaults,
    );
    expect(r.items.map((i) => i.check)).not.toContain('SS-6');
    expect(r.passed.find((p) => p.check === 'SS-6')).toEqual({
      check: 'SS-6',
      title: 'Automatic bans',
      notChecked: 'No permission to read it',
    });
  });

  it('7: one item per domain missing a record, naming it', () => {
    const r = evaluate(
      {
        ...fresh(),
        domains: [
          { id: 'd1', name: 'example.org', enabled: true, allowRelaying: false, missing: [], dmarcPolicy: 'reject' },
          {
            id: 'd2',
            name: 'example.net',
            enabled: true,
            allowRelaying: false,
            missing: ['dkim'],
            dmarcPolicy: 'reject',
          },
        ],
      },
      defaults,
    );
    const dns = r.items.filter((i) => i.check === 'SS-13');
    expect(dns).toHaveLength(1);
    expect(dns[0].subject).toBe('example.net');
    expect(dns[0].title).toContain('DKIM');
  });

  it('7b: a record that doesn’t match is named as such, not as missing (#236)', () => {
    const domain = { id: 'd1', name: 'example.org', enabled: true, allowRelaying: false, dmarcPolicy: 'reject' };
    const one = (missing: string[], different: string[]) =>
      evaluate({ ...fresh(), domains: [{ ...domain, missing, different }] }, defaults).items.filter(
        (i) => i.check === 'SS-13',
      );
    expect(one([], [])).toHaveLength(0);
    const mx = one([], ['mx']);
    expect(mx[0].title).toBe('example.org’s MX in public DNS doesn’t match this server');
    expect(mx[0].why).toContain('somewhere else');
    expect(mx[0].value).toEqual(['mx:different']);
    const both = one(['dkim'], ['mx']);
    expect(both[0].title).toBe('example.org is missing DKIM in public DNS, and its MX doesn’t match this server');
    expect(one(['dkim'], [])[0].value).toEqual(['dkim']);
  });

  it('8: legacy protocols on point to the switch, with no Fix', () => {
    const item = evaluate(fresh(), defaults).items.find((i) => i.check === 'SS-15');
    expect(item?.action).toEqual({ kind: 'hardening' });
  });

  it('orders by severity, and turning DMARC checks off is flagged while a stricter rule is not', () => {
    const s: Snapshot = {
      ...fresh(),
      imap: { allowPlainTextAuth: true },
      authentication: { passwordMinStrength: 'three', passwordMinLength: 8, passwordHashAlgorithm: 'pbkdf2' },
      senderAuth: { dmarcVerify: { match: {}, else: 'disable' } },
    };
    expect(ids(s)).toEqual(['SS-1', 'SS-11', 'SS-15', 'SS-16', 'SS-17']);
    const strict = {
      ...fresh(),
      senderAuth: { dmarcVerify: { match: { 0: { if: 'local_port == 25', then: 'strict' } }, else: 'disable' } },
    };
    expect(ids(strict)).not.toContain('SS-11');
  });

  it('open metrics and p=none are flagged; a set secret is not', () => {
    const s: Snapshot = {
      ...fresh(),
      metrics: { prometheus: { '@type': 'Enabled', authSecret: null } },
      domains: [
        { id: 'd1', name: 'example.org', enabled: true, allowRelaying: false, missing: [], dmarcPolicy: 'none' },
      ],
    };
    expect(ids(s)).toEqual(expect.arrayContaining(['SS-12', 'SS-18']));
    const locked = { ...fresh(), metrics: { prometheus: { '@type': 'Enabled', authSecret: '********' } } };
    expect(ids(locked)).not.toContain('SS-12');
  });

  it('OpenID Connect directories without an audience, or taking opaque tokens on user info, are flagged', () => {
    const dir = { oidc: true, requireAudience: 'inbuxa', opaqueTokens: null };
    const s: Snapshot = {
      ...fresh(),
      directories: [
        { ...dir, id: 'a', name: 'Keycloak' },
        { ...dir, id: 'b', name: 'Old Keycloak', requireAudience: null, opaqueTokens: 'userinfo' },
        { ...dir, id: 'c', name: 'Introspected', opaqueTokens: 'introspection' },
        { ...dir, id: 'd', name: 'LDAP', oidc: false, requireAudience: null },
      ],
    };
    const items = evaluate(s, defaults).items.filter((i) => i.check === 'SS-30' || i.check === 'SS-31');
    expect(items.map((i) => [i.check, i.subject])).toEqual([
      ['SS-30', 'b'],
      ['SS-31', 'b'],
    ]);
    expect(items[0].title).toContain('Old Keycloak');
    expect(items[0].action).toEqual({ kind: 'review', viewName: 'x:Directory', id: 'b' });
    expect(ids(fresh())).not.toContain('SS-30');
  });
});
