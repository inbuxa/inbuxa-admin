/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, it, expect } from 'vitest';
import { currentMode, plan, routeName, type Current } from './plan';

const stock: Current = {
  route: { match: { '0': { if: 'is_local_domain(rcpt_domain)', then: "'local'" } }, else: "'mx'" },
  tls: { match: { '0': { if: "retry_num > 0 && last_error == 'tls'", then: "'invalid-tls'" } }, else: "'default'" },
  routes: [],
  tlsStrategies: [],
};

const ses = {
  kind: 'relay' as const,
  host: 'email-smtp.eu-west-1.amazonaws.com',
  port: 465,
  implicitTls: true,
  username: 'AKIAEXAMPLE',
  password: 'pw',
};

describe('routeName', () => {
  it('reads quoted names only', () => {
    expect(routeName("'mx'")).toBe('mx');
    expect(routeName('"relay"')).toBe('relay');
    expect(routeName("if_then(a, 'x', 'y')")).toBeNull();
  });
});

describe('currentMode', () => {
  it('knows direct, a relay, and something else', () => {
    expect(currentMode(stock)).toEqual({ kind: 'direct' });
    const relay = { id: 'r1', name: 'relay', type: 'Relay', address: 'smtp.x' };
    expect(currentMode({ ...stock, route: { ...stock.route, else: "'relay'" }, routes: [relay] })).toEqual({
      kind: 'relay',
      route: relay,
    });
    expect(currentMode({ ...stock, route: { ...stock.route, else: "'gone'" } })).toEqual({
      kind: 'other',
      target: "'gone'",
    });
  });
});

describe('plan', () => {
  it('changes nothing when already direct', () => {
    expect(plan(stock, { kind: 'direct' })).toEqual({ changes: [] });
  });

  it('adds a relay route and points the fallback at it, keeping local delivery', () => {
    const p = plan(stock, ses);
    expect(p.routeCreate).toMatchObject({
      '@type': 'Relay',
      name: 'relay',
      address: ses.host,
      port: 465,
      implicitTls: true,
      authUsername: 'AKIAEXAMPLE',
      authSecret: { '@type': 'Value', secret: 'pw' },
    });
    expect(p.strategy?.route).toEqual({ match: stock.route.match, else: "'relay'" });
    expect(p.strategy?.tls).toBeUndefined();
    expect(p.tlsCreate).toBeUndefined();
  });

  it('requires STARTTLS for a relay that is not encrypted from the start', () => {
    const p = plan(stock, { ...ses, host: 'smtp.postmarkapp.com', port: 587, implicitTls: false });
    expect(p.tlsCreate).toMatchObject({ name: 'relay-tls', startTls: 'require' });
    expect(Object.values(p.strategy!.tls!.match)[0]).toEqual({
      if: "mx == 'smtp.postmarkapp.com'",
      then: "'relay-tls'",
    });
    expect(Object.values(p.strategy!.tls!.match)).toHaveLength(2);
  });

  it('updates a saved relay and keeps its password when none is typed', () => {
    const cur: Current = {
      ...stock,
      route: { ...stock.route, else: "'relay'" },
      routes: [{ id: 'r1', name: 'relay', type: 'Relay', address: 'old.example' }],
    };
    const p = plan(cur, { ...ses, password: '' });
    expect(p.routeUpdate?.id).toBe('r1');
    expect(p.routeUpdate?.patch).not.toHaveProperty('authSecret');
    expect(p.routeCreate).toBeUndefined();
    expect(p.strategy).toBeUndefined();
  });

  it('going back to direct removes the relay encryption rule and leaves other rules alone', () => {
    const cur: Current = {
      ...stock,
      route: {
        match: { ...stock.route.match, '1': { if: "rcpt_domain == 'partner.example'", then: "'partner'" } },
        else: "'relay'",
      },
      tls: {
        match: { '0': { if: "mx == 'smtp.x'", then: "'relay-tls'" }, '1': stock.tls.match['0'] },
        else: "'default'",
      },
      routes: [{ id: 'r1', name: 'relay', type: 'Relay' }],
    };
    const p = plan(cur, { kind: 'direct' });
    expect(p.strategy?.route).toEqual({ match: cur.route.match, else: "'mx'" });
    expect(p.strategy?.tls).toEqual({ match: { '0': stock.tls.match['0'] }, else: "'default'" });
  });

  it('refuses to take over a route named relay that is not one', () => {
    expect(() => plan({ ...stock, routes: [{ id: 'm', name: 'relay', type: 'Mx' }] }, ses)).toThrow();
  });
});
