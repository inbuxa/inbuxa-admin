/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what the sending setup reads and what it will write (settings-reorg,
 * guided setup 1). Kept apart from the page so the review step can show it
 * before anything happens, and so it can be tested.
 *
 * How the server picks a way out: the outbound strategy's `route` expression
 * names a route for each message. `'local'` and `'mx'` are built in; any
 * other name is an x:MtaRoute. The stock expression sends mail for this
 * server's own domains to `'local'` and everything else to `'mx'` (direct).
 * So a relay is one Relay route plus a changed fallback ("else"). The
 * conditions someone may have added are left exactly as they are.
 *
 * STARTTLS towards a relay is only tried by default. When a relay is reached
 * over STARTTLS, a TLS strategy that requires it is added for that host, so
 * the relay's password is never sent unencrypted.
 */

export const RELAY_ROUTE = 'relay';
export const RELAY_TLS = 'relay-tls';

export type Expr = { match: Record<string, { if: string; then: string }>; else: string };

export interface RouteInfo {
  id: string;
  name: string;
  type: string;
  address?: string;
  port?: number;
  implicitTls?: boolean;
  authUsername?: string | null;
}

export interface Current {
  route: Expr;
  tls: Expr;
  routes: RouteInfo[];
  tlsStrategies: { id: string; name: string }[];
}

export type Mode =
  | { kind: 'direct' }
  | { kind: 'relay'; route: RouteInfo }
  /** A fallback this guide didn't set up: another route, or an expression. */
  | { kind: 'other'; target: string };

export interface RelayChoice {
  host: string;
  port: number;
  implicitTls: boolean;
  username: string;
  /** Empty keeps the password already saved on the route. */
  password: string;
}

export type Choice = { kind: 'direct' } | ({ kind: 'relay' } & RelayChoice);

export interface Plan {
  /** Plain sentences for the review step. */
  changes: string[];
  routeCreate?: Record<string, unknown>;
  routeUpdate?: { id: string; patch: Record<string, unknown> };
  tlsCreate?: Record<string, unknown>;
  strategy?: { route?: Expr; tls?: Expr };
}

/** `'mx'` → mx; null when the fallback is an expression rather than a name. */
export function routeName(value: string): string | null {
  const m = /^\s*'([^'\\]*)'\s*$/.exec(value) ?? /^\s*"([^"\\]*)"\s*$/.exec(value);
  return m ? m[1] : null;
}

export function currentMode(cur: Current): Mode {
  const name = routeName(cur.route.else);
  if (name === 'mx') return { kind: 'direct' };
  const route = name ? cur.routes.find((r) => r.name === name) : undefined;
  if (route?.type === 'Relay') return { kind: 'relay', route };
  if (route?.type === 'Mx') return { kind: 'direct' };
  return { kind: 'other', target: cur.route.else };
}

/** The other conditions on the route expression, which this guide never touches. */
export function otherRules(cur: Current): { if: string; then: string }[] {
  return Object.values(cur.route.match).filter((r) => !/^\s*is_local_domain\(rcpt_domain\)\s*$/.test(r.if));
}

function renumber(rules: { if: string; then: string }[]): Record<string, { if: string; then: string }> {
  return Object.fromEntries(rules.map((r, i) => [String(i), r]));
}

function isRelayTlsRule(r: { then: string }): boolean {
  return routeName(r.then) === RELAY_TLS;
}

function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function sameExpr(a: Expr, b: Expr): boolean {
  const norm = (e: Expr) => JSON.stringify([Object.values(e.match), e.else.trim()]);
  return norm(a) === norm(b);
}

export function plan(cur: Current, choice: Choice): Plan {
  const out: Plan = { changes: [] };
  const tlsRules = Object.values(cur.tls.match).filter((r) => !isRelayTlsRule(r));

  if (choice.kind === 'direct') {
    const route: Expr = { match: cur.route.match, else: quote('mx') };
    const tls: Expr = { match: renumber(tlsRules), else: cur.tls.else };
    const next: Plan['strategy'] = {};
    if (!sameExpr(route, cur.route)) {
      next.route = route;
      out.changes.push('Mail to other domains is delivered directly to each domain’s mail servers, on port 25.');
    }
    if (!sameExpr(tls, cur.tls)) {
      next.tls = tls;
      out.changes.push('The rule that required encryption towards the relay is removed.');
    }
    if (next.route || next.tls) out.strategy = next;
    return out;
  }

  const host = choice.host.trim();
  const existing = cur.routes.find((r) => r.name === RELAY_ROUTE);
  const fields: Record<string, unknown> = {
    address: host,
    port: choice.port,
    protocol: 'smtp',
    implicitTls: choice.implicitTls,
    allowInvalidCerts: false,
    authUsername: choice.username.trim() || null,
  };
  if (!choice.username.trim()) fields.authSecret = { '@type': 'None' };
  else if (choice.password) fields.authSecret = { '@type': 'Value', secret: choice.password };

  const how = choice.implicitTls ? 'encrypted from the start' : 'STARTTLS, required';
  if (existing && existing.type === 'Relay') {
    out.routeUpdate = { id: existing.id, patch: fields };
    out.changes.push(`The saved relay route "${RELAY_ROUTE}" now points to ${host}, port ${choice.port} (${how}).`);
  } else if (existing) {
    throw new Error(`A route named "${RELAY_ROUTE}" already exists and isn’t a relay. Rename it first.`);
  } else {
    out.routeCreate = {
      '@type': 'Relay',
      name: RELAY_ROUTE,
      description: `Outgoing relay: ${host}`,
      ...fields,
      ...(fields.authSecret ? {} : { authSecret: { '@type': 'None' } }),
    };
    out.changes.push(`A relay route "${RELAY_ROUTE}" is added: ${host}, port ${choice.port} (${how}).`);
  }
  if (choice.username.trim()) {
    out.changes.push(
      choice.password || !existing
        ? `It signs in as ${choice.username.trim()}, with the password you entered.`
        : `It signs in as ${choice.username.trim()}, with the password already saved.`,
    );
  }

  const route: Expr = { match: cur.route.match, else: quote(RELAY_ROUTE) };
  const next: Plan['strategy'] = {};
  if (!sameExpr(route, cur.route)) {
    next.route = route;
    out.changes.push('Mail to other domains goes through the relay. Mail for this server’s own domains stays here.');
  }

  let tls: Expr = { match: renumber(tlsRules), else: cur.tls.else };
  if (!choice.implicitTls) {
    tls = {
      match: renumber([{ if: `mx == ${quote(host)}`, then: quote(RELAY_TLS) }, ...tlsRules]),
      else: cur.tls.else,
    };
    if (!cur.tlsStrategies.some((s) => s.name === RELAY_TLS)) {
      out.tlsCreate = {
        name: RELAY_TLS,
        description: 'Encryption required towards the outgoing relay',
        startTls: 'require',
        dane: 'optional',
        mtaSts: 'optional',
        allowInvalidCerts: false,
      };
    }
  }
  if (!sameExpr(tls, cur.tls)) {
    next.tls = tls;
    out.changes.push(
      choice.implicitTls
        ? 'The rule that required STARTTLS towards the old relay is removed; this one is encrypted from the start.'
        : `Connections to ${host} must be encrypted: if STARTTLS isn’t offered, nothing is sent.`,
    );
  }
  if (next.route || next.tls) out.strategy = next;
  return out;
}
