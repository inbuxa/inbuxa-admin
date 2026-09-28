/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: guided setup, "Connect a sign-in directory" (settings-reorg, first
 * wave). Pick Active Directory, OpenLDAP, FreeIPA or an OpenID Connect
 * provider, fill in the connection, save it (a directory nothing points at
 * changes nothing), test a real person against it with the server's
 * directory test, then choose which domains sign in through it. The server
 * default is offered last, behind a warning, because it's how an admin
 * locks themselves out.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { WizardNote, WizardShell, type WizardStep } from '@/components/wizard/WizardShell';
import { apiFetch } from '@/services/api';
import { getAccountId, jmapRequest, jmapSet } from '@/services/jmap/client';
import { useAuthStore } from '@/stores/authStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { cn } from '@/lib/utils';
import { directoryObject, PRESETS, type Connection, type Preset } from './presets';

interface DomainRow {
  id: string;
  name: string;
  directoryId: string | null;
  accounts: number | null;
}

interface TestResult {
  kind?: string;
  opened: boolean;
  error?: string;
  oidc?: { issuer: string };
  lookup?: {
    found?: 'account' | 'group' | 'none';
    email?: string;
    aliases?: string[];
    groups?: string[];
    description?: string | null;
    error?: string;
  };
  signIn?: { ok: boolean; wrongPassword?: boolean; error?: string; email?: string };
}

function failure(body: JmapSetResponse | undefined, kind: 'notCreated' | 'notUpdated'): string | null {
  const e = body?.[kind] ? Object.values(body[kind]!)[0] : undefined;
  if (!e) return null;
  const details = (e.validationErrors ?? []).map((v) => JSON.stringify(v)).join('; ');
  return [e.description, details].filter(Boolean).join(' ') || e.type;
}

async function loadDomains(): Promise<{ domains: DomainRow[]; serverDefault: string | null }> {
  const res = await jmapRequest([
    ['x:Domain/get', { accountId: getAccountId('x:Domain'), ids: null, properties: ['name', 'directoryId'] }, 'd'],
    [
      'x:Authentication/get',
      { accountId: getAccountId('x:Authentication'), ids: ['singleton'], properties: ['directoryId'] },
      'a',
    ],
  ]);
  const list = (id: string) =>
    (res.find(([, , i]) => i === id)?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? [];
  const domains = list('d')
    .map((d): DomainRow => ({
      id: String(d.id),
      name: String(d.name),
      directoryId: (d.directoryId as string | null) ?? null,
      accounts: null,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  // How many accounts each domain has: the people a new directory must know.
  const counts = await jmapRequest(
    domains.map((d, i) => [
      'x:Account/query',
      { accountId: getAccountId('x:Account'), filter: { domainId: d.id }, calculateTotal: true, limit: 0 },
      String(i),
    ]),
  ).catch(() => []);
  for (const [, body, i] of counts) {
    const total = (body as { total?: number }).total;
    if (typeof total === 'number') domains[Number(i)].accounts = total;
  }
  return { domains, serverDefault: (list('a')[0]?.directoryId as string | null) ?? null };
}

export function DirectorySetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const section = viewToSection['x:Directory'] ?? 'Settings';
  const me = useAuthStore((s) => s.username) ?? '';

  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<Preset | null>(null);
  const [conn, setConn] = useState<Connection>({
    url: '',
    baseDn: '',
    bindDn: '',
    bindPassword: '',
    allowInvalidCerts: false,
    issuer: '',
    usernameDomain: '',
  });
  const [savedId, setSavedId] = useState<string | null>(null);
  const [testAddress, setTestAddress] = useState('');
  const [testPassword, setTestPassword] = useState('');
  const [result, setResult] = useState<TestResult | null>(null);
  const [data, setData] = useState<{ domains: DomainRow[]; serverDefault: string | null } | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [asDefault, setAsDefault] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    loadDomains()
      .then((d) => live && setData(d))
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const steps: WizardStep[] = useMemo(
    () => [
      { id: 'kind', title: t('dirSetup.stepKind', 'Directory') },
      { id: 'connect', title: t('dirSetup.stepConnect', 'Connection') },
      { id: 'test', title: t('dirSetup.stepTest', 'Test a person') },
      { id: 'domains', title: t('dirSetup.stepDomains', 'Domains') },
      { id: 'review', title: t('dirSetup.stepReview', 'Review') },
      { id: 'done', title: t('dirSetup.stepDone', 'Done') },
    ],
    [t],
  );

  const myDomain = me.includes('@') ? me.split('@').pop()!.toLowerCase() : '';
  const chosen = data?.domains.filter((d) => picked.has(d.id)) ?? [];
  const lockoutRisk = chosen.some((d) => d.name.toLowerCase() === myDomain) || asDefault;
  const testPassed =
    !!result?.opened &&
    (preset?.kind === 'Oidc' ? true : result.lookup?.found === 'account' && result.signIn?.ok !== false);

  // Save the directory (create, or update the one saved earlier in this run), then test it.
  const saveAndTest = async () => {
    if (!preset) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const description = t('dirSetup.description', '{{name}} (set up with the guide)', { name: preset.name });
      const object = directoryObject(preset, conn, description);
      let id = savedId;
      if (id) {
        const { '@type': _type, ...patch } = object;
        void _type;
        const [res] = await jmapSet('x:Directory', getAccountId('x:Directory'), { update: { [id]: patch } });
        const f = failure(res?.[1] as unknown as JmapSetResponse, 'notUpdated');
        if (f) throw new Error(f);
      } else {
        const [res] = await jmapSet('x:Directory', getAccountId('x:Directory'), { create: { dir: object } });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        id = (body?.created?.dir as { id?: string } | undefined)?.id ?? null;
        if (!id) throw new Error(failure(body, 'notCreated') ?? 'The directory could not be saved.');
        setSavedId(id);
      }
      setConn((c) => ({ ...c, bindPassword: '' }));
      setStep(2);
      if (testAddress || preset.kind === 'Oidc') await runTest(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runTest = async (id = savedId) => {
    if (!id) return;
    setBusy(true);
    setError(null);
    try {
      // The server rebuilds directories a moment after a save.
      for (let attempt = 0; attempt < 5; attempt++) {
        const res = await apiFetch('/api/directory/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // OpenID Connect has no lookup to try, so any address will do there.
          body: JSON.stringify({
            directoryId: id,
            address: testAddress.trim() || 'check@invalid',
            password: testPassword || undefined,
          }),
        });
        if (!res.ok) {
          const problem = (await res.json().catch(() => ({}))) as { detail?: string; title?: string };
          throw new Error(problem.detail ?? problem.title ?? `The test failed (${res.status}).`);
        }
        const body = (await res.json()) as TestResult;
        if (body.opened || !body.error?.startsWith("The server hasn't loaded")) {
          setResult(body);
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setResult({ opened: false, error: t('dirSetup.notLoaded', 'The server hasn’t loaded the directory yet.') });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!savedId || !data) return;
    setBusy(true);
    setError(null);
    try {
      if (chosen.length > 0) {
        const update = Object.fromEntries(chosen.map((d) => [d.id, { directoryId: savedId }]));
        const [res] = await jmapSet('x:Domain', getAccountId('x:Domain'), { update });
        const f = failure(res?.[1] as unknown as JmapSetResponse, 'notUpdated');
        if (f) throw new Error(f);
      }
      if (asDefault) {
        const [res] = await jmapSet('x:Authentication', getAccountId('x:Authentication'), {
          update: { singleton: { directoryId: savedId } },
        });
        const f = failure(res?.[1] as unknown as JmapSetResponse, 'notUpdated');
        if (f) {
          // Put the domains back, so a refused default leaves nothing half done.
          await jmapSet('x:Domain', getAccountId('x:Domain'), {
            update: Object.fromEntries(chosen.map((d) => [d.id, { directoryId: d.directoryId }])),
          }).catch(() => undefined);
          throw new Error(f);
        }
      }
      setStep(5);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!data) return error ? <div className="p-8 text-center text-destructive">{error}</div> : <LoadingFallback />;

  const common = {
    icon: 'fingerprint',
    title: t('dirSetup.title', 'Connect a sign-in directory'),
    subtitle: t(
      'dirSetup.subtitle',
      'Let people sign in with the accounts they already have in Active Directory, LDAP or an OpenID Connect provider.',
    ),
    steps,
    current: step,
    onCancel: () => navigate(`/${section}/x:Directory`),
  };
  const errorLine = error && (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {error}
    </p>
  );
  const field = (id: keyof Connection, label: string, placeholder?: string, hint?: string, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={`dir-${id}`}>{label}</Label>
      <Input
        id={`dir-${id}`}
        type={type}
        value={String(conn[id])}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        spellCheck={false}
        onChange={(e) => setConn((c) => ({ ...c, [id]: e.target.value }))}
        className="max-w-lg"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  // ── Step 1: which directory ──
  if (step === 0) {
    return (
      <WizardShell
        {...common}
        canNext={preset !== null}
        onNext={() => setStep(1)}
        aside={
          <WizardNote title={t('dirSetup.safeTitle', 'Nothing changes yet')}>
            <p>
              {t(
                'dirSetup.safe',
                'The directory is saved and tested on its own first. Sign-in only moves to it for the domains you pick at the end.',
              )}
            </p>
            <p>{t('dirSetup.sql', 'An SQL database as a directory is set up by hand, under Directories.')}</p>
          </WizardNote>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPreset(p)}
              aria-pressed={preset?.id === p.id}
              className={cn(
                'flex flex-col items-start gap-1.5 rounded-xl border p-4 text-left transition-colors hover:border-primary/60',
                preset?.id === p.id ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card',
              )}
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-xs text-muted-foreground">{p.hint}</span>
            </button>
          ))}
        </div>
      </WizardShell>
    );
  }

  // ── Step 2: connection ──
  if (step === 1 && preset) {
    const ldap = preset.kind === 'Ldap';
    const ready = ldap
      ? /^ldaps?:\/\//.test(conn.url.trim()) &&
        conn.baseDn.trim() !== '' &&
        (savedId !== null || conn.bindDn.trim() === '' || conn.bindPassword !== '')
      : /^https:\/\//.test(conn.issuer.trim());
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(0)}
        onNext={() => void saveAndTest()}
        nextLabel={t('dirSetup.saveNext', 'Save and continue')}
        canNext={ready}
        busy={busy}
        aside={
          ldap ? (
            <WizardNote title={t('dirSetup.bindTitle', 'The lookup account')}>
              <p>
                {t(
                  'dirSetup.bind',
                  'A read-only account the server uses to find people. Each person’s own password is then checked by signing in as them.',
                )}
              </p>
            </WizardNote>
          ) : (
            <WizardNote title={t('dirSetup.oidcTitle', 'At the provider')}>
              <p>
                {t(
                  'dirSetup.oidc',
                  'Register inbuxa as a client there. Mail apps can’t do browser sign-in, so people use app passwords for IMAP and SMTP.',
                )}
              </p>
            </WizardNote>
          )
        }
      >
        {ldap ? (
          <>
            {field(
              'url',
              t('dirSetup.url', 'Server'),
              preset.example.url,
              t(
                'dirSetup.urlHint',
                'ldaps:// on 636 is encrypted from the start. ldap:// uses STARTTLS unless it’s this machine.',
              ),
            )}
            {field('baseDn', t('dirSetup.baseDn', 'Search base'), preset.example.baseDn)}
            {field('bindDn', t('dirSetup.bindDn', 'Lookup account'), preset.example.bindDn)}
            {field(
              'bindPassword',
              t('dirSetup.bindPassword', 'Lookup account password'),
              savedId ? t('dirSetup.keep', 'Leave empty to keep the saved one') : undefined,
              undefined,
              'password',
            )}
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                {t('dirSetup.invalidCerts', 'Accept an untrusted certificate')}
                <span className="block text-xs text-muted-foreground">
                  {t(
                    'dirSetup.invalidCertsHint',
                    'Only for a self-signed test server. Anyone in between could read passwords.',
                  )}
                </span>
              </span>
              <Switch
                checked={conn.allowInvalidCerts}
                onCheckedChange={(v) => setConn((c) => ({ ...c, allowInvalidCerts: v }))}
              />
            </label>
          </>
        ) : (
          <>
            {field('issuer', t('dirSetup.issuer', 'Issuer URL'), preset.example.issuer)}
            {field(
              'usernameDomain',
              t('dirSetup.usernameDomain', 'Domain for plain user names (optional)'),
              'example.org',
              t('dirSetup.usernameDomainHint', 'Added to a user name without @, to make the address.'),
            )}
          </>
        )}
        {ldap && (
          <div className="space-y-1.5">
            <Label htmlFor="dir-test-address">{t('dirSetup.testAddress', 'A person to test with')}</Label>
            <Input
              id="dir-test-address"
              type="email"
              value={testAddress}
              onChange={(e) => setTestAddress(e.target.value)}
              placeholder="jane@corp.example"
              className="max-w-lg"
            />
          </div>
        )}
        {errorLine}
      </WizardShell>
    );
  }

  // ── Step 3: test a person ──
  if (step === 2 && preset) {
    const r = result;
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        canNext={testPassed}
        aside={
          <WizardNote title={t('dirSetup.testTitle', 'What the test does')}>
            <p>
              {t(
                'dirSetup.testHow',
                'The server looks the address up in the directory and, if you give a password, signs in as that person. Nothing is created here, and a wrong password doesn’t count against anyone.',
              )}
            </p>
          </WizardNote>
        }
      >
        {preset.kind === 'Ldap' && (
          <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="dir-t-addr">{t('dirSetup.testAddress', 'A person to test with')}</Label>
              <Input
                id="dir-t-addr"
                type="email"
                value={testAddress}
                onChange={(e) => setTestAddress(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dir-t-pass">{t('dirSetup.testPassword', 'Their password (optional)')}</Label>
              <Input
                id="dir-t-pass"
                type="password"
                autoComplete="off"
                value={testPassword}
                onChange={(e) => setTestPassword(e.target.value)}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => void runTest()}
              disabled={busy || !testAddress.trim()}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('dirSetup.test', 'Test')}
            </Button>
          </div>
        )}
        {preset.kind === 'Oidc' && !r && (
          <Button type="button" variant="outline" onClick={() => void runTest()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('dirSetup.testOidc', 'Check the provider')}
          </Button>
        )}

        {r && (
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              {r.opened ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              ) : (
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              )}
              {r.opened
                ? r.oidc
                  ? t('dirSetup.oidcOk', 'The provider answered, as {{issuer}}.', { issuer: r.oidc.issuer })
                  : t('dirSetup.opened', 'The server can use this directory.')
                : t('dirSetup.notOpened', 'The directory didn’t open: {{error}}', { error: r.error ?? '' })}
            </li>
            {r.lookup && (
              <li className="flex items-start gap-2">
                {r.lookup.found === 'account' ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                <span>
                  {r.lookup.error
                    ? t('dirSetup.lookupError', 'The lookup failed: {{error}}', { error: r.lookup.error })
                    : r.lookup.found === 'account'
                      ? t('dirSetup.found', 'Found {{name}} <{{email}}>.', {
                          name: r.lookup.description ?? '',
                          email: r.lookup.email,
                        })
                      : r.lookup.found === 'group'
                        ? t('dirSetup.foundGroup', 'That address is a group, not a person. Try a person’s address.')
                        : t(
                            'dirSetup.notFound',
                            'Nobody with that address. Check the search base and that the address is in the mail attribute.',
                          )}
                  {r.lookup.found === 'account' && (r.lookup.aliases?.length || r.lookup.groups?.length) ? (
                    <span className="block text-xs text-muted-foreground">
                      {r.lookup.aliases?.length
                        ? t('dirSetup.aliases', 'Also receives: {{list}}. ', { list: r.lookup.aliases.join(', ') })
                        : ''}
                      {r.lookup.groups?.length
                        ? t('dirSetup.groups', 'Groups: {{list}}.', { list: r.lookup.groups.join(', ') })
                        : ''}
                    </span>
                  ) : null}
                </span>
              </li>
            )}
            {r.signIn && (
              <li className="flex items-start gap-2">
                {r.signIn.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                )}
                {r.signIn.ok
                  ? t('dirSetup.signInOk', 'The password signs in.')
                  : r.signIn.wrongPassword
                    ? t('dirSetup.wrongPassword', 'The directory says that password is wrong.')
                    : t('dirSetup.signInError', 'Signing in failed: {{error}}', { error: r.signIn.error ?? '' })}
              </li>
            )}
          </ul>
        )}
        {r && !testPassed && (
          <p className="text-sm text-muted-foreground">
            {t('dirSetup.fixHint', 'Go back to change the connection. Saving again updates the same directory.')}
          </p>
        )}
        {errorLine}
      </WizardShell>
    );
  }

  // ── Step 4: domains ──
  if (step === 3) {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(2)}
        onNext={() => setStep(4)}
        canNext={(chosen.length > 0 || asDefault) && (!lockoutRisk || understood)}
        aside={
          <WizardNote title={t('dirSetup.whoTitle', 'Who this affects')}>
            <p>
              {t(
                'dirSetup.who',
                'On a domain that moves to this directory, only people the directory knows can sign in with a password. Existing accounts it doesn’t know stop signing in and, for LDAP, stop receiving mail. App passwords keep working.',
              )}
            </p>
          </WizardNote>
        }
      >
        <ul className="divide-y rounded-xl border">
          {data.domains.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Checkbox
                id={`dd-${d.id}`}
                checked={picked.has(d.id)}
                onCheckedChange={(v) =>
                  setPicked((s) => {
                    const n = new Set(s);
                    if (v) n.add(d.id);
                    else n.delete(d.id);
                    return n;
                  })
                }
              />
              <label htmlFor={`dd-${d.id}`} className="min-w-0 flex-1">
                <span className="font-medium">{d.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {d.directoryId === savedId
                    ? t('dirSetup.alreadyThis', 'Already uses this directory.')
                    : d.directoryId
                      ? t('dirSetup.otherDir', 'Uses another directory now.')
                      : t('dirSetup.defaultDir', 'Uses the server default now.')}{' '}
                  {d.accounts !== null && t('dirSetup.accounts', '{{count}} accounts.', { count: d.accounts })}{' '}
                  {d.name.toLowerCase() === myDomain && t('dirSetup.yours', 'You sign in on this domain.')}
                </span>
              </label>
            </li>
          ))}
        </ul>
        <label className="flex items-start justify-between gap-4 rounded-xl border p-4 text-sm">
          <span>
            <span className="font-medium">{t('dirSetup.asDefault', 'Make it the server default')}</span>
            <span className="block text-xs text-muted-foreground">
              {t(
                'dirSetup.asDefaultHint',
                'For every domain without a directory of its own. Rarely what you want: prefer choosing domains.',
              )}
            </span>
          </span>
          <Switch checked={asDefault} onCheckedChange={setAsDefault} />
        </label>
        {lockoutRisk && (
          <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
            <p className="flex items-start gap-2 font-medium">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              {t('dirSetup.lockout', 'This includes the account you’re signed in with ({{me}}).', { me })}
            </p>
            <p className="text-muted-foreground">
              {t(
                'dirSetup.lockoutHint',
                'If the directory doesn’t know you, you can’t sign in again with your password. Test your own address first, keep an app password, or leave that domain out.',
              )}
            </p>
            <label className="flex items-center gap-2">
              <Checkbox checked={understood} onCheckedChange={(v) => setUnderstood(Boolean(v))} />
              {t('dirSetup.understood', 'I’ve checked I can still sign in')}
            </label>
          </div>
        )}
      </WizardShell>
    );
  }

  // ── Step 5: review ──
  if (step === 4) {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(3)}
        onNext={() => void apply()}
        nextLabel={t('dirSetup.apply', 'Switch sign-in over')}
        busy={busy}
        aside={
          <WizardNote tone="undo" title={t('dirSetup.undoTitle', 'Changing your mind')}>
            <p>
              {t(
                'dirSetup.undo',
                'Set a domain’s directory back to the server default. Accounts made from the directory stay, with the last password it supplied.',
              )}
            </p>
          </WizardNote>
        }
      >
        <p className="font-medium">{t('dirSetup.willChange', 'What will change')}</p>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {chosen.map((d) => (
            <li key={d.id}>
              {t('dirSetup.domainMoves', '{{domain}} signs in through {{dir}}{{note}}.', {
                domain: d.name,
                dir: preset?.name ?? '',
                note:
                  d.accounts !== null && d.accounts > 0
                    ? t('dirSetup.countNote', '; its {{count}} existing accounts must be in the directory', {
                        count: d.accounts,
                      })
                    : '',
              })}
            </li>
          ))}
          {asDefault && (
            <li>
              {t('dirSetup.defaultMoves', 'Every other domain without its own directory signs in through {{dir}}.', {
                dir: preset?.name ?? '',
              })}
            </li>
          )}
        </ul>
        {errorLine}
      </WizardShell>
    );
  }

  // ── Step 6: done ──
  return (
    <WizardShell
      {...common}
      onNext={() => navigate(`/${section}/x:Directory`)}
      nextLabel={t('wizard.finish', 'Finish')}
    >
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        {t('dirSetup.done', 'Sign-in now goes through {{dir}}.', { dir: preset?.name ?? '' })}
      </p>
      <p className="text-sm text-muted-foreground">
        {t(
          'dirSetup.doneHint',
          'Have someone sign in to the webmail with their directory password. Their account is created on first sign-in, with the name, aliases and groups the directory gives.',
        )}
      </p>
    </WizardShell>
  );
}
