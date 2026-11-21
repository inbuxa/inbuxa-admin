/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: `inbuxa:FrontEnds`, where the server's front ends are (contract
 * C-4): the console's and the webmail's addresses, the webmail's client
 * secret, and further origins allowed to call the server from a browser.
 *
 * The server registers each address as an OAuth client's redirect URI and
 * builds its cross-origin allowlist from them, together with what its
 * environment says (`INBUXA_ADMIN_URL`, `INBUXA_WEBMAIL_URL`,
 * `INBUXA_CORS_EXTRA_ORIGINS`). Redirect URIs are only ever added; the
 * allowlist is rebuilt on every save, so an origin taken out stops working.
 */

/** The singleton as `inbuxa:FrontEnds/get` returns it. */
export interface FrontEnds {
  adminUrl: string | null;
  webmailUrl: string | null;
  webmailClientSecretSet: boolean;
  extraOrigins: string[];
  /** What this node's environment says: the node that answered. */
  environmentAdminUrl: string | null;
  environmentWebmailUrl: string | null;
  environmentWebmailClientSecret: boolean;
  /** Milliseconds since the epoch, or null if never set. */
  changedAt: number | null;
  /** The account id of whoever set it last. */
  changedBy: string | null;
}

/** What the page edits. A secret typed here is sent once and never read back. */
export interface Draft {
  adminUrl: string;
  webmailUrl: string;
  /** A new secret to send; empty means keep what's stored. */
  webmailClientSecret: string;
  /** Forget the stored secret (only when no webmail address is left). */
  forgetSecret: boolean;
  extraOrigins: string[];
}

/** The fewest characters the server takes for the webmail's secret. */
export const MIN_SECRET_LENGTH = 32;

export function draftOf(f: FrontEnds): Draft {
  return {
    adminUrl: f.adminUrl ?? '',
    webmailUrl: f.webmailUrl ?? '',
    webmailClientSecret: '',
    forgetSecret: false,
    extraOrigins: [...f.extraOrigins],
  };
}

export function fromServer(v: Record<string, unknown>): FrontEnds {
  const str = (x: unknown) => (typeof x === 'string' && x.trim() !== '' ? x : null);
  const list = Array.isArray(v.extraOrigins) ? v.extraOrigins.filter((o): o is string => typeof o === 'string') : [];
  return {
    adminUrl: str(v.adminUrl),
    webmailUrl: str(v.webmailUrl),
    webmailClientSecretSet: v.webmailClientSecretSet === true,
    extraOrigins: list,
    environmentAdminUrl: str(v.environmentAdminUrl),
    environmentWebmailUrl: str(v.environmentWebmailUrl),
    environmentWebmailClientSecret: v.environmentWebmailClientSecret === true,
    changedAt: typeof v.changedAt === 'number' ? v.changedAt : null,
    changedBy: str(v.changedBy),
  };
}

/**
 * The origin (`scheme://host[:port]`) of an http or https address, lowercased
 * and without a default port, as the server works it out; null otherwise.
 */
export function originOf(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  // URL already drops a default port and lowercases the scheme and host.
  return `${u.protocol}//${u.host}`.toLowerCase();
}

/** Why an address can't be a front end's, or null if it can. Empty is fine: it clears it. */
export function urlProblem(url: string): string | null {
  const t = url.trim();
  if (t === '') return null;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return 'Not a web address. Start it with https://';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'Must start with https:// or http://';
  if (!u.hostname) return 'Has no host name';
  if (u.username || u.password) return 'Must not carry a user name or password';
  if (u.search || u.hash) return 'Must not have a query or a #fragment';
  return null;
}

/** Why an extra origin can't be added, or null. */
export function originProblem(origin: string, already: string[]): string | null {
  const t = origin.trim();
  if (t === '') return 'Type an origin first';
  const o = originOf(t);
  if (!o) return 'Not an http or https origin, such as https://mail.example.com';
  const u = new URL(t);
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash) return 'Just the origin: no path after the host';
  if (already.some((a) => originOf(a) === o)) return 'Already in the list';
  return null;
}

/** Why the draft can't be saved, or null. */
export function draftProblem(d: Draft, f: FrontEnds): string | null {
  const admin = urlProblem(d.adminUrl);
  if (admin) return `Console address: ${admin}`;
  const webmail = urlProblem(d.webmailUrl);
  if (webmail) return `Webmail address: ${webmail}`;
  const secret = d.webmailClientSecret;
  if (secret && f.environmentWebmailClientSecret)
    return 'This node takes the webmail’s secret from INBUXA_WEBMAIL_CLIENT_SECRET, so one can’t be set here.';
  if (secret && secret.length < MIN_SECRET_LENGTH)
    return `The webmail’s secret needs at least ${MIN_SECRET_LENGTH} characters.`;
  const hasSecret = f.environmentWebmailClientSecret || secret !== '' || (f.webmailClientSecretSet && !d.forgetSecret);
  if (d.webmailUrl.trim() && !hasSecret) return 'The webmail needs a client secret to be registered.';
  return null;
}

const normUrl = (s: string) => {
  const t = s.trim().replace(/\/+$/, '');
  return t === '' ? null : t;
};

/** Just what changed, as an `inbuxa:FrontEnds/set` update; empty if nothing did. */
export function patchOf(d: Draft, f: FrontEnds): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const admin = normUrl(d.adminUrl);
  if (admin !== (f.adminUrl ? normUrl(f.adminUrl) : null)) patch.adminUrl = admin;
  const webmail = normUrl(d.webmailUrl);
  if (webmail !== (f.webmailUrl ? normUrl(f.webmailUrl) : null)) patch.webmailUrl = webmail;
  if (d.webmailClientSecret) patch.webmailClientSecret = d.webmailClientSecret;
  else if (d.forgetSecret && f.webmailClientSecretSet) patch.webmailClientSecret = null;
  const next = d.extraOrigins.map((o) => originOf(o) ?? o.trim());
  const same = next.length === f.extraOrigins.length && next.every((o, i) => o === f.extraOrigins[i]);
  if (!same) patch.extraOrigins = next;
  return patch;
}

/**
 * Whether saving would take the console's own origin off the server's
 * allowlist, so this page (and the rest of the console) stops working once
 * saved. Only for a console on another origin than the server's: one the
 * server serves itself needs no allowlist. The environment's
 * `INBUXA_CORS_EXTRA_ORIGINS` isn't shown over JMAP, so an origin only it
 * names is still reported; the warning says so.
 */
export function cutsOffThisConsole(d: Draft, f: FrontEnds, consoleOrigin: string, apiOrigin: string): boolean {
  const here = originOf(consoleOrigin);
  if (!here || here === originOf(apiOrigin)) return false;
  const allowed = (adminUrl: string | null, extra: string[]) =>
    [adminUrl, f.environmentAdminUrl, ...extra].some((u) => u !== null && originOf(u) === here);
  return allowed(f.adminUrl, f.extraOrigins) && !allowed(normUrl(d.adminUrl), d.extraOrigins);
}

type Fill = (bytes: Uint8Array<ArrayBuffer>) => Uint8Array<ArrayBuffer>;

/** A new secret for the webmail: 48 characters from a URL-safe alphabet. */
export function newSecret(random: Fill = (b) => crypto.getRandomValues(b)): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  // 64 symbols: each byte's low six bits pick one without bias.
  return Array.from(random(new Uint8Array(48)), (b) => alphabet[b & 63]).join('');
}
