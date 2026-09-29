/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the security to-do list's checks (security to-do list spec,
 * SS-1 to SS-18). Pure: each check reads a snapshot of what the console
 * loaded and says whether it holds. There is no score; severity only
 * orders the list.
 *
 * A Fix writes one field (SS-8 two, on one object) back to its default or
 * to the value named here, and never a secret, a DNS record or a listener
 * (SS-21): those are Review items.
 */

export type Severity = 'critical' | 'important' | 'good';

export const SEVERITY_ORDER: Severity[] = ['critical', 'important', 'good'];

export interface Change {
  field: string;
  /** Before and after, in words. */
  from: string;
  to: string;
}

export type Action =
  | {
      kind: 'fix';
      object: string;
      id: string;
      /** What the fix writes. */
      patch: Record<string, unknown>;
      /** What it writes back on Undo. */
      undo: Record<string, unknown>;
      changes: Change[];
    }
  | {
      kind: 'review';
      /** The page to open. */
      viewName: string;
      /** A record on that page, when there's one to open. */
      id?: string;
      /** What to look at there, side by side or listed. */
      details?: { label: string; value: string }[];
    }
  | { kind: 'hardening' };

export interface Item {
  check: string;
  severity: Severity;
  /** What within the check: '' for a server-wide setting, else the domain, strategy or certificate. */
  subject: string;
  /** What the check saw: an acceptance holds only while this stays the same (SS-24). */
  value: unknown;
  title: string;
  why: string;
  action: Action;
  /** The object and field Explain would ask about. */
  explain?: { object: string; id: string; field: string };
}

export interface Passed {
  check: string;
  title: string;
  /** Why it couldn't run, when it couldn't (SS-29). */
  notChecked?: string;
}

export interface Expr {
  match?: unknown;
  else?: string;
  default?: string;
}

export interface DomainSnapshot {
  id: string;
  name: string;
  enabled: boolean;
  allowRelaying: boolean;
  /** Core records missing from public DNS (SS-13), or null if not checked. */
  missing: string[] | null;
  /** The live DMARC policy (SS-18), or null if there's none or it wasn't checked. */
  dmarcPolicy: string | null;
}

export interface Snapshot {
  now: number;
  imap?: { allowPlainTextAuth?: boolean };
  rcpt?: { allowRelaying?: Expr };
  auth?: { require?: Expr };
  certificates?: { id: string; names: string[]; notValidAfter: string | null }[];
  security?: { authBanRate?: unknown; abuseBanRate?: unknown; scanBanRate?: unknown };
  http?: { rateLimitAnonymous?: unknown };
  oidc?: { anonymousClientRegistration?: boolean; requireClientRegistration?: boolean };
  authentication?: { passwordMinStrength?: string; passwordMinLength?: number; passwordHashAlgorithm?: string };
  tlsStrategies?: { id: string; name: string; allowInvalidCerts?: boolean }[];
  senderAuth?: { dmarcVerify?: Expr };
  metrics?: { prometheus?: { '@type'?: string; authSecret?: unknown } };
  mtaSts?: { mode?: string };
  domains?: DomainSnapshot[];
  /** The legacy-protocols switch: true while any legacy protocol is on. */
  legacyOn?: boolean;
  /** Why a part couldn't be read, by part name. */
  unavailable: Partial<Record<Part, string>>;
}

export type Part =
  | 'imap'
  | 'rcpt'
  | 'auth'
  | 'certificates'
  | 'security'
  | 'http'
  | 'oidc'
  | 'authentication'
  | 'tlsStrategies'
  | 'senderAuth'
  | 'metrics'
  | 'mtaSts'
  | 'domains'
  | 'dns'
  | 'legacy';

/** The schema's defaults, as the console knows them. */
export type Defaults = (object: string, field: string) => unknown;

// --- Expressions --------------------------------------------------------

interface Rule {
  if: string;
  then: string;
}

const squash = (s: unknown) =>
  String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim();

/** An expression in one shape, however it came: `{default}`, or `match` as a list or a map. */
export function normalizeExpr(e: Expr | undefined | null): { rules: Rule[]; else: string } {
  if (!e) return { rules: [], else: '' };
  if (typeof e.default === 'string') return { rules: [], else: squash(e.default) };
  const raw = e.match;
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.keys(raw as object)
          .sort((a, b) => Number(a) - Number(b) || a.localeCompare(b))
          .map((k) => (raw as Record<string, unknown>)[k])
      : [];
  const rules = list.map((r) => {
    const rule = r as Partial<Rule>;
    return { if: squash(rule.if), then: squash(rule.then) };
  });
  return { rules, else: squash(e.else) };
}

export function sameExpr(a: Expr | undefined | null, b: Expr | undefined | null): boolean {
  return JSON.stringify(normalizeExpr(a)) === JSON.stringify(normalizeExpr(b));
}

/** An expression as one readable line. */
export function exprText(e: Expr | undefined | null): string {
  const n = normalizeExpr(e);
  if (n.rules.length === 0) return n.else || '(empty)';
  return [...n.rules.map((r) => `if ${r.if} then ${r.then}`), `else ${n.else}`].join('; ');
}

/** What an expression gives for port 25 connections, reading only a `local_port == 25` rule. */
function onPort25(e: Expr | undefined): string {
  const n = normalizeExpr(e);
  const rule = n.rules.find((r) => r.if === 'local_port == 25');
  return rule ? rule.then : n.else;
}

// --- Words --------------------------------------------------------------

function rateText(r: unknown): string {
  if (!r || typeof r !== 'object') return 'off';
  const { count, period } = r as { count?: number; period?: string | number };
  return `${count} per ${period}`;
}

const DAY = 86_400_000;

// --- The checks ---------------------------------------------------------

interface Result {
  items: Item[];
  passed: Passed[];
}

/** Every check against the snapshot: the to-do items, most serious first, and what passed or couldn't run. */
export function evaluate(s: Snapshot, defaults: Defaults): Result {
  const items: Item[] = [];
  const passed: Passed[] = [];

  /** Runs one check, or lists it as not checked when a part it needs couldn't be read. */
  const check = (id: string, title: string, parts: Part[], run: () => Item[]) => {
    const missing = parts.find((p) => s.unavailable[p]);
    if (missing) {
      passed.push({ check: id, title, notChecked: s.unavailable[missing] });
      return;
    }
    const found = run();
    if (found.length === 0) passed.push({ check: id, title });
    else items.push(...found);
  };

  // Critical

  check('SS-1', 'Plain-text passwords over unencrypted IMAP', ['imap'], () =>
    s.imap?.allowPlainTextAuth
      ? [
          {
            check: 'SS-1',
            severity: 'critical',
            subject: '',
            value: true,
            title: 'IMAP accepts passwords over unencrypted connections',
            why: 'Anyone on the network path can read those passwords.',
            action: {
              kind: 'fix',
              object: 'x:Imap',
              id: 'singleton',
              patch: { allowPlainTextAuth: false },
              undo: { allowPlainTextAuth: true },
              changes: [{ field: 'Allow plain text authentication', from: 'on', to: 'off' }],
            },
            explain: { object: 'x:Imap', id: 'singleton', field: 'allowPlainTextAuth' },
          },
        ]
      : [],
  );

  check('SS-2', 'Relaying rule', ['rcpt'], () => {
    const now = s.rcpt?.allowRelaying;
    const def = defaults('x:MtaStageRcpt', 'allowRelaying') as Expr | undefined;
    if (!now || !def || sameExpr(now, def)) return [];
    return [
      {
        check: 'SS-2',
        severity: 'critical',
        subject: '',
        value: normalizeExpr(now),
        title: 'The rule for who may relay mail has been changed',
        why: 'A wrong rule makes this an open relay that spammers find within hours. It may be deliberate, so check it.',
        action: {
          kind: 'review',
          viewName: 'x:MtaStageRcpt',
          details: [
            { label: 'Now', value: exprText(now) },
            { label: 'Default', value: exprText(def) },
          ],
        },
        explain: { object: 'x:MtaStageRcpt', id: 'singleton', field: 'allowRelaying' },
      },
    ];
  });

  check('SS-3', 'Domains that relay for anyone', ['domains'], () => {
    const relaying = (s.domains ?? []).filter((d) => d.allowRelaying).map((d) => d.name);
    if (relaying.length === 0) return [];
    return [
      {
        check: 'SS-3',
        severity: 'critical',
        subject: '',
        value: [...relaying].sort(),
        title:
          relaying.length === 1
            ? `${relaying[0]} relays mail for anyone`
            : `${relaying.length} domains relay mail for anyone`,
        why: 'Mail claiming to be from these domains is passed on without sign-in, which spammers can use.',
        action: {
          kind: 'review',
          viewName: 'x:Domain',
          details: [{ label: 'Domains', value: relaying.join(', ') }],
        },
      },
    ];
  });

  check('SS-4', 'Sign-in for sending', ['auth'], () => {
    const now = s.auth?.require;
    const def = defaults('x:MtaStageAuth', 'require') as Expr | undefined;
    if (!now || !def || sameExpr(now, def)) return [];
    return [
      {
        check: 'SS-4',
        severity: 'critical',
        subject: '',
        value: normalizeExpr(now),
        title: 'The rule for when sending needs a sign-in has been changed',
        why: 'If sending from mail apps doesn’t require a sign-in, anyone can send through this server.',
        action: {
          kind: 'review',
          viewName: 'x:MtaStageAuth',
          details: [
            { label: 'Now', value: exprText(now) },
            { label: 'Default', value: exprText(def) },
          ],
        },
        explain: { object: 'x:MtaStageAuth', id: 'singleton', field: 'require' },
      },
    ];
  });

  // SS-5 and SS-14 read the same certificates: within 7 days is critical and
  // replaces the 30-day item.
  const certItems = (within: number, severity: Severity, id: string) => () =>
    (s.certificates ?? []).flatMap((c): Item[] => {
      if (!c.notValidAfter) return [];
      const until = Date.parse(c.notValidAfter);
      if (Number.isNaN(until)) return [];
      const left = until - s.now;
      if (id === 'SS-14' && left <= 7 * DAY) return [];
      if (left > within) return [];
      const name = c.names[0] ?? c.id;
      const expired = left <= 0;
      const days = Math.max(0, Math.ceil(left / DAY));
      return [
        {
          check: id,
          severity,
          subject: c.id,
          value: c.notValidAfter,
          title: expired
            ? `The certificate for ${name} has expired`
            : `The certificate for ${name} expires in ${days} day${days === 1 ? '' : 's'}`,
          why: expired
            ? 'Mail apps and browsers refuse the connection, or warn about it.'
            : 'Once it expires, mail apps and browsers refuse the connection, or warn about it.',
          action: { kind: 'review', viewName: 'x:Certificate', id: c.id },
        },
      ];
    });
  check(
    'SS-5',
    'Certificates expired or expiring within 7 days',
    ['certificates'],
    certItems(7 * DAY, 'critical', 'SS-5'),
  );

  // Important

  check('SS-6', 'Automatic bans', ['security'], () => {
    const rates = ['authBanRate', 'abuseBanRate', 'scanBanRate'] as const;
    const off = rates.filter((r) => s.security?.[r] == null);
    if (off.length === 0) return [];
    const words: Record<(typeof rates)[number], string> = {
      authBanRate: 'Failed sign-ins',
      abuseBanRate: 'Abuse',
      scanBanRate: 'Port scans',
    };
    const patch = Object.fromEntries(off.map((r) => [r, defaults('x:Security', r) ?? null]));
    return [
      {
        check: 'SS-6',
        severity: 'important',
        subject: '',
        value: off,
        title: 'Automatic IP bans are partly off',
        why: 'Without them, an address can keep guessing passwords or probing the server for as long as it likes.',
        action: {
          kind: 'fix',
          object: 'x:Security',
          id: 'singleton',
          patch,
          undo: Object.fromEntries(off.map((r) => [r, null])),
          changes: off.map((r) => ({ field: `${words[r]} ban`, from: 'off', to: rateText(patch[r]) })),
        },
        explain: { object: 'x:Security', id: 'singleton', field: off[0] },
      },
    ];
  });

  check('SS-7', 'HTTP rate limits', ['http'], () => {
    if (s.http?.rateLimitAnonymous != null) return [];
    const def = defaults('x:Http', 'rateLimitAnonymous') ?? null;
    return [
      {
        check: 'SS-7',
        severity: 'important',
        subject: '',
        value: null,
        title: 'Requests from people who aren’t signed in aren’t rate limited',
        why: 'The sign-in page and the API can then be hammered without limit.',
        action: {
          kind: 'fix',
          object: 'x:Http',
          id: 'singleton',
          patch: { rateLimitAnonymous: def },
          undo: { rateLimitAnonymous: null },
          changes: [{ field: 'Anonymous rate limit', from: 'off', to: rateText(def) }],
        },
        explain: { object: 'x:Http', id: 'singleton', field: 'rateLimitAnonymous' },
      },
    ];
  });

  check('SS-8', 'OAuth client registration', ['oidc'], () => {
    const anon = s.oidc?.anonymousClientRegistration === true;
    const unreq = s.oidc?.requireClientRegistration === false;
    if (!anon && !unreq) return [];
    return [
      {
        check: 'SS-8',
        severity: 'important',
        subject: '',
        value: { anonymousClientRegistration: anon, requireClientRegistration: !unreq },
        title: 'Apps can sign people in without being registered first',
        why: 'Any app, including a phishing one, could then ask your people to sign in with their inbuxa password.',
        action: {
          kind: 'fix',
          object: 'x:OidcProvider',
          id: 'singleton',
          patch: { anonymousClientRegistration: false, requireClientRegistration: true },
          undo: {
            anonymousClientRegistration: s.oidc?.anonymousClientRegistration ?? false,
            requireClientRegistration: s.oidc?.requireClientRegistration ?? true,
          },
          changes: [
            ...(anon ? [{ field: 'Anonymous client registration', from: 'on', to: 'off' }] : []),
            ...(unreq ? [{ field: 'Require client registration', from: 'off', to: 'on' }] : []),
          ],
        },
        explain: { object: 'x:OidcProvider', id: 'singleton', field: 'anonymousClientRegistration' },
      },
    ];
  });

  check('SS-9', 'Password rules', ['authentication'], () => {
    const STRENGTHS = ['zero', 'one', 'two', 'three', 'four'];
    const a = s.authentication ?? {};
    const minStrength = String(defaults('x:Authentication', 'passwordMinStrength') ?? 'three');
    const minLength = Number(defaults('x:Authentication', 'passwordMinLength') ?? 8);
    const weakStrength =
      a.passwordMinStrength !== undefined && STRENGTHS.indexOf(a.passwordMinStrength) < STRENGTHS.indexOf(minStrength);
    const shortLength = typeof a.passwordMinLength === 'number' && a.passwordMinLength < minLength;
    if (!weakStrength && !shortLength) return [];
    const patch: Record<string, unknown> = {};
    const undo: Record<string, unknown> = {};
    const changes: Change[] = [];
    if (weakStrength) {
      patch.passwordMinStrength = minStrength;
      undo.passwordMinStrength = a.passwordMinStrength;
      changes.push({ field: 'Minimum password strength', from: String(a.passwordMinStrength), to: minStrength });
    }
    if (shortLength) {
      patch.passwordMinLength = minLength;
      undo.passwordMinLength = a.passwordMinLength;
      changes.push({ field: 'Minimum password length', from: String(a.passwordMinLength), to: String(minLength) });
    }
    return [
      {
        check: 'SS-9',
        severity: 'important',
        subject: '',
        value: { passwordMinStrength: a.passwordMinStrength, passwordMinLength: a.passwordMinLength },
        title: 'Password rules are weaker than the default',
        why: 'Short or guessable passwords are the easiest way into a mailbox. Raising the rules doesn’t touch existing passwords; they apply at the next change.',
        action: { kind: 'fix', object: 'x:Authentication', id: 'singleton', patch, undo, changes },
        explain: {
          object: 'x:Authentication',
          id: 'singleton',
          field: weakStrength ? 'passwordMinStrength' : 'passwordMinLength',
        },
      },
    ];
  });

  check('SS-10', 'Certificate checks on outgoing mail', ['tlsStrategies'], () =>
    (s.tlsStrategies ?? [])
      .filter((t) => t.allowInvalidCerts)
      .map((t) => ({
        check: 'SS-10',
        severity: 'important' as const,
        subject: t.id,
        value: true,
        title: `Outgoing mail accepts invalid certificates (${t.name || t.id})`,
        why: 'Mail sent with this TLS strategy can be intercepted by anyone who can present any certificate at all.',
        action: { kind: 'review' as const, viewName: 'x:MtaTlsStrategy', id: t.id },
        explain: { object: 'x:MtaTlsStrategy', id: t.id, field: 'allowInvalidCerts' },
      })),
  );

  check('SS-11', 'DMARC checks on incoming mail', ['senderAuth'], () => {
    const now = s.senderAuth?.dmarcVerify;
    const def = defaults('x:SenderAuth', 'dmarcVerify') as Expr | undefined;
    if (!now || (def && sameExpr(now, def)) || onPort25(now) !== 'disable') return [];
    return [
      {
        check: 'SS-11',
        severity: 'important',
        subject: '',
        value: normalizeExpr(now),
        title: 'Incoming mail isn’t checked against the sender domain’s DMARC policy',
        why: 'Mail forged in the name of a bank or a colleague then gets the same treatment as the real thing.',
        action: {
          kind: 'review',
          viewName: 'x:SenderAuth',
          details: [
            { label: 'Now', value: exprText(now) },
            ...(def ? [{ label: 'Default', value: exprText(def) }] : []),
          ],
        },
        explain: { object: 'x:SenderAuth', id: 'singleton', field: 'dmarcVerify' },
      },
    ];
  });

  check('SS-12', 'Metrics access', ['metrics'], () => {
    const p = s.metrics?.prometheus;
    if (p?.['@type'] !== 'Enabled') return [];
    const secret = p.authSecret;
    const set =
      secret != null &&
      secret !== '' &&
      !(typeof secret === 'object' && (secret as { '@type'?: string })['@type'] === 'None');
    if (set) return [];
    return [
      {
        check: 'SS-12',
        severity: 'important',
        subject: '',
        value: 'open',
        title: 'Anyone who can reach the server can read its metrics',
        why: 'They show how busy the server is and when. Give Prometheus a user name and password.',
        action: { kind: 'review', viewName: 'x:Metrics/CollectorPrometheus' },
      },
    ];
  });

  check('SS-13', 'Mail records in DNS', ['domains', 'dns'], () =>
    (s.domains ?? [])
      .filter((d) => d.enabled && d.missing && d.missing.length > 0)
      .map((d) => ({
        check: 'SS-13',
        severity: 'important' as const,
        subject: d.name,
        value: [...(d.missing ?? [])].sort(),
        title: `${d.name} is missing ${listWords((d.missing ?? []).map((k) => k.toUpperCase()))} in public DNS`,
        why: 'Without them, other servers can’t find where to deliver, or can’t tell real mail from forged mail, so more of it lands in spam.',
        action: { kind: 'review' as const, viewName: 'x:Domain', id: d.id },
      })),
  );

  check('SS-14', 'Certificates expiring within 30 days', ['certificates'], certItems(30 * DAY, 'important', 'SS-14'));

  // Good practice

  check('SS-15', 'Legacy mail protocols', ['legacy'], () =>
    s.legacyOn
      ? [
          {
            check: 'SS-15',
            severity: 'good',
            subject: '',
            value: 'on',
            title: 'Legacy mail protocols are on',
            why: 'IMAP, POP3 and ManageSieve are more to guard. If nobody uses them, turning them off closes their ports.',
            action: { kind: 'hardening' },
          },
        ]
      : [],
  );

  check('SS-16', 'Password hashing', ['authentication'], () => {
    const algo = s.authentication?.passwordHashAlgorithm;
    if (algo !== 'pbkdf2') return [];
    return [
      {
        check: 'SS-16',
        severity: 'good',
        subject: '',
        value: algo,
        title: 'New passwords are hashed with PBKDF2, not Argon2id',
        why: 'Argon2id makes a stolen password database much slower to crack. Existing hashes stay as they are until each password changes.',
        action: {
          kind: 'fix',
          object: 'x:Authentication',
          id: 'singleton',
          patch: { passwordHashAlgorithm: 'argon2id' },
          undo: { passwordHashAlgorithm: 'pbkdf2' },
          changes: [{ field: 'Password hash algorithm', from: 'PBKDF2', to: 'Argon2id' }],
        },
        explain: { object: 'x:Authentication', id: 'singleton', field: 'passwordHashAlgorithm' },
      },
    ];
  });

  check('SS-17', 'MTA-STS', ['mtaSts'], () => {
    const mode = s.mtaSts?.mode;
    if (mode === undefined || mode === 'enforce') return [];
    return [
      {
        check: 'SS-17',
        severity: 'good',
        subject: '',
        value: mode,
        title: `MTA-STS is in ${mode} mode, not enforced`,
        why: 'Until it’s enforced, other servers may still deliver to you unencrypted if someone interferes. Move to enforce once the TLS reports look clean.',
        action: { kind: 'review', viewName: 'x:MtaSts' },
        explain: { object: 'x:MtaSts', id: 'singleton', field: 'mode' },
      },
    ];
  });

  check('SS-18', 'DMARC policies', ['domains', 'dns'], () =>
    (s.domains ?? [])
      .filter((d) => d.enabled && d.dmarcPolicy === 'none')
      .map((d) => ({
        check: 'SS-18',
        severity: 'good' as const,
        subject: d.name,
        value: 'none',
        title: `${d.name}’s DMARC policy is p=none`,
        why: 'Receiving servers are told to deliver mail forged in its name anyway. Once DMARC reports show your own mail passing, move to quarantine or reject.',
        action: { kind: 'review' as const, viewName: 'x:Domain', id: d.id },
      })),
  );

  return { items: sortItems(items), passed };
}

function listWords(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function checkNumber(id: string): number {
  return Number(id.replace('SS-', ''));
}

/** Most serious first, then in check order. */
export function sortItems(items: Item[]): Item[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      checkNumber(a.check) - checkNumber(b.check) ||
      a.subject.localeCompare(b.subject),
  );
}
