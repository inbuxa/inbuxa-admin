/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: "Order a certificate" (#167). Takes the names you want, finds the
 * domain they belong to (or adds one just for certificates), checks the
 * names, sets them as that domain's certificate hostnames, and watches the
 * certificate arrive. The server orders certificates per domain, so this is
 * the domain's automatic certificate with a name list of your choosing.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, Loader2, Plus, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { WizardNote, WizardShell, type WizardStep } from '@/components/wizard/WizardShell';
import { getAccountId, jmapSet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import { RESOLVER_NAME } from '@/features/dns/liveCheck';
import { cn } from '@/lib/utils';
import { classify, orderNames, type Method } from './names';
import {
  domainsFor,
  hostnamesFor,
  isValidName,
  isWildcard,
  nameInDomain,
  parseNames,
  renewalState,
  sameNames,
  suggestDomain,
} from './orders';
import {
  addProvider,
  CHALLENGE,
  type CertRow,
  type Check,
  coveringCert,
  type DomainRow,
  fmtDate,
  LE_PRODUCTION,
  LE_STAGING,
  type Loaded,
  load,
  pollOrders,
  refusal,
  resolveAddresses,
} from './shared';
import { StateIcon } from './StateIcon';

const WATCH_MS = 5 * 60_000;

export function OrderCertificatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const section = viewToSection['x:Certificate'] ?? 'Settings';
  const domainSection = viewToSection['x:Domain'] ?? 'Management';

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [text, setText] = useState('');
  const [domainId, setDomainId] = useState<string | null>(null);
  const [newDomain, setNewDomain] = useState<string | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [serverAddresses, setServerAddresses] = useState<string[] | null>(null);
  const [anyway, setAnyway] = useState(false);
  const [staging, setStaging] = useState(false);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [watch, setWatch] = useState<{ certs: CertRow[]; tasks: Record<string, unknown>[]; at: number } | null>(null);
  const [watching, setWatching] = useState(false);
  const [madeDefault, setMadeDefault] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const reload = useCallback(async () => {
    const d = await load();
    setData(d);
    setContact((c) => c || (d.providers.find((p) => p.contact.length > 0)?.contact[0] ?? ''));
    return d;
  }, []);

  useEffect(() => {
    let live = true;
    load()
      .then((d) => {
        if (!live) return;
        setData(d);
        setContact(d.providers.find((p) => p.contact.length > 0)?.contact[0] ?? '');
      })
      .catch((e: unknown) => live && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  const steps: WizardStep[] = useMemo(
    () => [
      { id: 'names', title: t('certOrder.stepNames', 'Names') },
      { id: 'check', title: t('certSetup.stepCheck', 'Check names') },
      { id: 'account', title: t('certSetup.stepAccount', 'Account') },
      { id: 'review', title: t('certSetup.stepReview', 'Review') },
      { id: 'watch', title: t('certOrder.stepWatch', 'Watch it arrive') },
    ],
    [t],
  );

  const names = useMemo(() => parseNames(text), [text]);
  const invalid = names.filter((n) => !isValidName(n));
  const candidates = useMemo(() => (data ? domainsFor(names, data.domains) : []), [data, names]);
  // The closest domain unless one was picked and still fits.
  const domain: DomainRow | undefined = candidates.find((d) => d.id === domainId) ?? candidates[0];
  const method: Method = domain?.dnsAutomatic ? 'dns' : 'tls';
  const wildcardBlocked = method === 'tls' && names.some(isWildcard);
  const currentNames = domain?.automatic
    ? orderNames(domain.name, method, data?.serverName ?? '', domain.zone, domain.hostnames)
    : [];
  const unchanged = !!domain?.automatic && sameNames(currentNames, names);
  const replaced = domain?.automatic && !unchanged ? currentNames.filter((n) => !names.includes(n)) : [];

  const directory = staging ? LE_STAGING : LE_PRODUCTION;
  const provider = data?.providers.find((p) => p.directory === directory && p.challengeType === CHALLENGE[method]);

  const runChecks = useCallback(async () => {
    if (!data || method !== 'tls') return;
    setChecks(names.map((name) => ({ name, state: 'checking', addresses: [] })));
    const anchor =
      data.serverName ||
      domain?.zone
        .find((r) => r.type === 'MX')
        ?.value.split(/\s+/)
        .pop() ||
      '';
    const mine = anchor ? await resolveAddresses(anchor).catch(() => []) : [];
    setServerAddresses(mine);
    const results = await Promise.all(
      names.map(async (name): Promise<Check> => {
        try {
          const addresses = await resolveAddresses(name);
          return {
            name,
            state: mine.length > 0 ? classify(addresses, mine) : addresses.length ? 'ok' : 'missing',
            addresses,
          };
        } catch {
          return { name, state: 'error', addresses: [] };
        }
      }),
    );
    setChecks(results);
  }, [data, domain, method, names]);

  const poll = useCallback(async () => {
    setWatch(await pollOrders());
  }, []);

  const startWatching = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    const began = Date.now();
    setWatching(true);
    void poll().catch(() => undefined);
    timer.current = setInterval(() => {
      if (Date.now() - began > WATCH_MS) {
        clearInterval(timer.current!);
        timer.current = null;
        setWatching(false);
        return;
      }
      void poll().catch(() => undefined);
    }, 5000);
  }, [poll]);

  /** Adds a domain that's only there for certificates: no DKIM keys, nothing published. */
  const addDomain = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const [res] = await jmapSet('x:Domain', getAccountId('x:Domain'), {
        create: {
          d: {
            name,
            description: t('certOrder.domainDescription', 'Added for certificates'),
            dkimManagement: { '@type': 'Manual' },
            dnsManagement: { '@type': 'Manual' },
            certificateManagement: { '@type': 'Manual' },
          },
        },
      });
      const failed = refusal(res?.[1], 'The domain could not be added.');
      if (failed) throw new Error(failed);
      const id = (res?.[1] as { created?: Record<string, { id?: string }> })?.created?.d?.id;
      await reload();
      if (id) setDomainId(id);
      setNewDomain(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    if (!data || !domain) return;
    setBusy(true);
    setError(null);
    let made: string | null = null;
    try {
      let providerId = provider?.id;
      if (!providerId) {
        providerId = await addProvider(method, contact, staging);
        made = providerId;
      }
      const [res] = await jmapSet('x:Domain', getAccountId('x:Domain'), {
        update: {
          [domain.id]: {
            certificateManagement: {
              '@type': 'Automatic',
              acmeProviderId: providerId,
              subjectAlternativeNames: hostnamesFor(names),
            },
          },
        },
      });
      const failed = refusal(res?.[1], 'The certificate could not be ordered.');
      if (failed) throw new Error(failed);
      setStartedAt(Date.now());
      setStep(4);
      startWatching();
    } catch (e) {
      // Failsafe: an account added for this order is removed again when nothing uses it.
      if (made)
        await jmapSet('x:AcmeProvider', getAccountId('x:AcmeProvider'), { destroy: [made] }).catch(() => undefined);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const makeDefault = async (certId: string) => {
    setBusy(true);
    setError(null);
    try {
      const [res] = await jmapSet('x:SystemSettings', getAccountId('x:SystemSettings'), {
        update: { singleton: { defaultCertificateId: certId } },
      });
      const failed = refusal(res?.[1], 'The default certificate could not be changed.');
      if (failed) throw new Error(failed);
      setMadeDefault(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <div className="mx-auto max-w-3xl p-8 text-center text-destructive">{loadError}</div>;
  if (!data) return <LoadingFallback />;

  const listView = `/${section}/x:Certificate`;
  const common = {
    icon: 'shield-check',
    title: t('certOrder.title', 'Order a certificate'),
    subtitle: t(
      'certOrder.subtitle',
      'A free Let’s Encrypt certificate for the names you choose, renewed by the server before it expires.',
    ),
    steps,
    current: domain ? step : 0,
    onCancel: () => navigate(listView),
  };
  const errorLine = error && (
    <p className="flex items-start gap-2 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      {error}
    </p>
  );
  const how = method === 'dns' ? t('certSetup.howDnsWord', 'through DNS') : t('certSetup.howTlsWord', 'on port 443');

  // ── Step 1: names (also where it goes back to if the domain stops fitting) ──
  if (step === 0 || !domain) {
    const ready = names.length > 0 && invalid.length === 0;
    const suggestion = newDomain ?? suggestDomain(names);
    return (
      <WizardShell
        {...common}
        canNext={ready && !!domain && !wildcardBlocked && !unchanged && !busy}
        onNext={() => {
          setAnyway(false);
          setStep(1);
          void runChecks();
        }}
        aside={
          <>
            <WizardNote title={t('certOrder.oneDomainTitle', 'One certificate per domain')}>
              <p>
                {t(
                  'certOrder.oneDomain',
                  'The server orders each certificate for a domain, and renews it for as long as the domain says so. The names you enter become that domain’s certificate hostnames.',
                )}
              </p>
            </WizardNote>
            <WizardNote title={t('certSetup.howTitle', 'How the server proves it’s yours')}>
              <p>
                {t(
                  'certOrder.howDns',
                  'When the domain’s DNS is connected, the names are checked through DNS, and wildcards work. Otherwise Let’s Encrypt connects to this server on port 443 for each name.',
                )}
              </p>
            </WizardNote>
          </>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="cert-names">{t('certOrder.namesLabel', 'Names the certificate covers')}</Label>
          <Textarea
            id="cert-names"
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'mail.example.com\n*.example.com'}
            className="max-w-md font-mono text-[13px]"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            {t('certOrder.namesHint', 'One per line. A wildcard (*.example.com) covers every name one level under it.')}
          </p>
          {invalid.length > 0 && (
            <p className="text-sm text-destructive">
              {t('certOrder.invalid', 'Not a name a certificate can cover: {{names}}', { names: invalid.join(', ') })}
            </p>
          )}
        </div>

        {ready && candidates.length > 0 && domain && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('certOrder.domainLabel', 'Domain')}</Label>
              {candidates.length > 1 ? (
                <Select value={domain.id} onValueChange={setDomainId}>
                  <SelectTrigger className="w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {candidates.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-sm font-medium">{domain.name}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {method === 'dns'
                  ? t('certSetup.viaDns', 'Checked through DNS.')
                  : t('certSetup.viaTls', 'Checked on port 443.')}
              </p>
            </div>
            {wildcardBlocked && (
              <p className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <span>
                  {t('certOrder.wildcardNeedsDns', 'A wildcard can only be checked through DNS.')}{' '}
                  <Link className="text-primary hover:underline" to={`/${domainSection}/Wizard/dns/${domain.id}`}>
                    {t('certOrder.connectDns', 'Connect {{domain}}’s DNS', { domain: domain.name })}
                  </Link>{' '}
                  {t('certOrder.connectDnsAfter', 'first, or leave the wildcard out.')}
                </span>
              </p>
            )}
            {unchanged && (
              <p className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                <span>
                  {t(
                    'certOrder.unchanged',
                    '{{domain}} already orders a certificate for exactly these names. To order it again after a failure, use Order again on the Certificates page.',
                    { domain: domain.name },
                  )}
                </span>
              </p>
            )}
            {replaced.length > 0 && (
              <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
                <p>
                  {t(
                    'certOrder.replaces',
                    '{{domain}} already gets a certificate for {{names}}. The new names take their place: that certificate isn’t renewed after this, and lasts until it expires.',
                    { domain: domain.name, names: currentNames.join(', ') },
                  )}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setText([...names, ...replaced].join('\n'))}
                >
                  {t('certOrder.keepThem', 'Keep those names too')}
                </Button>
              </div>
            )}
          </div>
        )}

        {ready && candidates.length === 0 && (
          <div className="space-y-2 rounded-xl border p-4 text-sm">
            <p>
              {t(
                'certOrder.noDomain',
                'None of your domains covers all of these names. Add the domain they belong to; it’s used only for certificates, with no DKIM keys and nothing published.',
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                aria-label={t('certOrder.domainLabel', 'Domain')}
                value={suggestion}
                onChange={(e) => setNewDomain(e.target.value.trim().toLowerCase())}
                className="w-64"
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || !isValidName(suggestion) || !names.every((n) => nameInDomain(n, suggestion))}
                onClick={() => void addDomain(suggestion)}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t('certOrder.addDomain', 'Add domain')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {t(
                'certOrder.addDomainHint',
                'To check the names through DNS (needed for wildcards), connect the new domain’s DNS from Domains afterwards.',
              )}
            </p>
          </div>
        )}
        {errorLine}
      </WizardShell>
    );
  }

  // ── Step 2: check names ──
  if (step === 1) {
    const pending = checks.some((c) => c.state === 'checking');
    const problems =
      method === 'tls' && checks.some((c) => c.state !== 'ok' && c.state !== 'checking' && c.state !== 'error');
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        canNext={!pending && (!problems || anyway)}
        aside={
          <>
            <WizardNote title={t('certSetup.checkedWith', 'How this is checked')}>
              <p>
                {t(
                  'certSetup.checkedHow',
                  'Each name is looked up in public DNS through {{resolver}}, and compared with where {{server}} points. Nothing is ordered yet.',
                  { resolver: RESOLVER_NAME, server: data.serverName || t('certSetup.thisServer', 'this server') },
                )}
              </p>
            </WizardNote>
            <WizardNote title={t('certSetup.whyAll', 'Why every name matters')}>
              <p>
                {t(
                  'certOrder.whyAllText',
                  'If a single name fails, the whole order fails. It keeps retrying, and you can order it again once the name is fixed.',
                )}
              </p>
            </WizardNote>
          </>
        }
      >
        {method === 'dns' ? (
          <p className="flex items-center gap-2 text-sm">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            {t('certOrder.dnsReady', 'Checked through {{domain}}’s connected DNS, covering {{names}}.', {
              domain: domain.name,
              names: names.join(', '),
            })}
          </p>
        ) : (
          <>
            {serverAddresses !== null && serverAddresses.length === 0 && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                {t(
                  'certSetup.noAnchor',
                  'This server’s own address couldn’t be looked up, so names are only checked for existing.',
                )}
              </p>
            )}
            <ul className="space-y-1 rounded-xl border p-4 text-sm">
              {checks.map((c) => (
                <li key={c.name} className="flex items-start gap-2">
                  <StateIcon state={c.state} />
                  <span className="font-mono text-[13px]">{c.name}</span>
                  <span className="text-muted-foreground">
                    {c.state === 'ok' && t('certSetup.ok', 'points here')}
                    {c.state === 'missing' &&
                      t('certSetup.missing', 'doesn’t exist: add a CNAME to {{server}}', {
                        server: data.serverName || t('certSetup.thisServer', 'this server'),
                      })}
                    {c.state === 'proxied' &&
                      t('certSetup.proxied', 'goes through the Cloudflare proxy: set it to DNS only (grey cloud)')}
                    {c.state === 'elsewhere' &&
                      t('certSetup.elsewhere', 'points somewhere else ({{ips}})', { ips: c.addresses.join(', ') })}
                    {c.state === 'error' && t('certSetup.lookupFailed', 'couldn’t be looked up')}
                  </span>
                </li>
              ))}
            </ul>
            {problems && (
              <div className="space-y-2 text-sm">
                <p>
                  {t('certSetup.fixOr', 'Fix those names in DNS and check again, or')}{' '}
                  <Link className="text-primary hover:underline" to={`/${domainSection}/Wizard/dns/${domain.id}`}>
                    {t('certSetup.connectDns', 'connect this domain’s DNS')}
                  </Link>{' '}
                  {t('certSetup.connectDnsWhy', 'so it’s checked through DNS instead.')}
                </p>
                <label className="flex items-center gap-2">
                  <Checkbox checked={anyway} onCheckedChange={(v) => setAnyway(v === true)} />
                  {t('certSetup.anyway', 'Order anyway (it will keep retrying until the names are fixed)')}
                </label>
              </div>
            )}
            <Button type="button" variant="outline" onClick={() => void runChecks()} disabled={pending}>
              <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
              {t('certSetup.checkAgain', 'Check again')}
            </Button>
          </>
        )}
      </WizardShell>
    );
  }

  // ── Step 3: account ──
  if (step === 2) {
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.trim());
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        canNext={!!provider || validEmail}
        aside={
          <WizardNote title={t('certSetup.stagingTitle', 'A practice run')}>
            <p>
              {t(
                'certOrder.stagingText',
                'Let’s Encrypt’s staging service issues certificates that browsers don’t trust, with far looser limits. Use it to see everything work, then order again without it.',
              )}
            </p>
          </WizardNote>
        }
      >
        {provider ? (
          <p className="text-sm">
            {t('certSetup.reuse', 'The Let’s Encrypt account already set up on this server will be used.')}
          </p>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="acme-contact">{t('certSetup.contact', 'Your email address')}</Label>
            <Input
              id="acme-contact"
              type="email"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              {t(
                'certSetup.contactHint',
                'Let’s Encrypt writes here only about problems with your account or certificates. Creating the account accepts their Subscriber Agreement.',
              )}{' '}
              <a
                className="text-primary hover:underline"
                href="https://letsencrypt.org/repository/"
                target="_blank"
                rel="noreferrer"
              >
                {t('certSetup.agreement', 'Read it')}
              </a>
            </p>
          </div>
        )}
        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="font-medium">{t('certSetup.staging', 'Practice run (staging)')}</span>
            <span className="block text-xs text-muted-foreground">
              {t('certSetup.stagingHint', 'Certificates browsers won’t trust. For trying this out.')}
            </span>
          </span>
          <Switch checked={staging} onCheckedChange={setStaging} />
        </label>
      </WizardShell>
    );
  }

  // ── Step 4: review ──
  if (step === 3) {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(2)}
        onNext={() => void apply()}
        nextLabel={t('certOrder.apply', 'Order it')}
        busy={busy}
        aside={
          <WizardNote tone="undo" title={t('certSetup.undoTitle', 'Changing your mind')}>
            <p>
              {t(
                'certOrder.undo',
                'Set the domain’s Certificate management back to Manual, or give it other names. A certificate already issued stays until it expires.',
              )}
            </p>
          </WizardNote>
        }
      >
        <div className="space-y-2">
          <p className="font-medium">{t('certSetup.willChange', 'What will change')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {!provider && (
              <li>
                {t('certSetup.newAccount', 'A Let’s Encrypt {{kind}}account is added for {{email}}.', {
                  kind: staging ? t('certSetup.stagingWord', 'staging ') : '',
                  email: contact.trim(),
                })}
              </li>
            )}
            <li>
              {t('certOrder.domainGets', '{{domain}} gets a certificate for {{names}}, checked {{how}}.', {
                domain: domain.name,
                names: names.join(', '),
                how,
              })}
            </li>
            {replaced.length > 0 && (
              <li>
                {t('certOrder.noLonger', 'These names are no longer renewed: {{names}}.', {
                  names: replaced.join(', '),
                })}
              </li>
            )}
          </ul>
        </div>
        {errorLine}
      </WizardShell>
    );
  }

  // ── Step 5: watch ──
  const cert = watch ? coveringCert(watch.certs, names) : undefined;
  const fresh = cert && startedAt !== null && new Date(cert.notValidBefore).getTime() > startedAt - 2 * 3600_000;
  const renewal = renewalState(watch?.tasks.find((x) => x.domainId === domain.id));
  let state: { icon: Check['state']; text: string };
  if (fresh) {
    state = {
      icon: 'ok',
      text: t('certSetup.issued', 'Issued. Valid until {{date}}.', { date: fmtDate(cert.notValidAfter) }),
    };
  } else if (renewal.kind === 'failed') {
    state = { icon: 'missing', text: renewal.reason || t('certSetup.failed', 'Failed.') };
  } else if (renewal.kind === 'retry') {
    state = { icon: 'checking', text: t('certSetup.retrying', 'Retrying: {{reason}}', { reason: renewal.reason }) };
  } else {
    state = { icon: 'checking', text: t('certSetup.waiting', 'Ordering…') };
  }
  const done = state.icon !== 'checking';
  const isDefault = madeDefault || (!!cert && data.defaultCertificateId === cert.id);

  return (
    <WizardShell
      {...common}
      onNext={() => navigate(listView)}
      nextLabel={t('wizard.finish', 'Finish')}
      aside={
        <WizardNote title={t('certOrder.whereTitle', 'Where it’s used')}>
          <p>
            {t(
              'certOrder.where',
              'Every connection that asks for one of its names gets this certificate, with nothing to assign. The default certificate is the one sent when a connection asks for a name no certificate covers.',
            )}
          </p>
        </WizardNote>
      }
    >
      <p className="flex items-start gap-2 text-sm">
        <StateIcon state={state.icon} />
        <span className="font-medium">{names.join(', ')}</span>
        <span className="text-muted-foreground">{state.text}</span>
      </p>
      {fresh && cert && (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          {isDefault ? (
            <span className="flex items-center gap-2 text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {t('certOrder.isDefault', 'This is the default certificate.')}
            </span>
          ) : (
            <Button type="button" variant="outline" disabled={busy} onClick={() => void makeDefault(cert.id)}>
              {t('certOrder.makeDefault', 'Make it the default certificate')}
            </Button>
          )}
        </div>
      )}
      {renewal.kind === 'failed' && (
        <p className="text-sm text-muted-foreground">
          {t('certOrder.failedNext', 'Fix what the reason says, then use Order again on the Certificates page.')}
        </p>
      )}
      {errorLine}
      {!done && !watching && (
        <Button type="button" variant="outline" onClick={startWatching}>
          <RefreshCw className="h-4 w-4" />
          {t('certSetup.keepWatching', 'Keep watching')}
        </Button>
      )}
      {!done && watching && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('certSetup.watchingHint', 'Checking every few seconds. Most certificates arrive within a minute.')}
        </p>
      )}
    </WizardShell>
  );
}
