/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: guided setup, "Certificates, automatically" (settings-reorg, first
 * wave). Picks domains, checks every name the certificate will cover before
 * anything is ordered, chooses how Let's Encrypt checks them (through DNS
 * when the domain's DNS is connected, otherwise on port 443), switches the
 * domains to automatic, and watches the certificates arrive.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, RefreshCw, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { WizardNote, WizardShell, type WizardStep } from '@/components/wizard/WizardShell';
import { getAccountId, jmapQueryAndGet, jmapRequest, jmapSet } from '@/services/jmap/client';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { dohQuery, RESOLVER_NAME } from '@/features/dns/liveCheck';
import { parseZone } from '@/features/dns/zone';
import { cn } from '@/lib/utils';
import { classify, orderNames, type Method, type NameState } from './names';

const LE_PRODUCTION = 'https://acme-v02.api.letsencrypt.org/directory';
const LE_STAGING = 'https://acme-staging-v02.api.letsencrypt.org/directory';
const CHALLENGE: Record<Method, string> = { dns: 'Dns01', tls: 'TlsAlpn01' };
const WATCH_MS = 5 * 60_000;

interface DomainRow {
  id: string;
  name: string;
  automatic: boolean;
  providerId?: string;
  dnsAutomatic: boolean;
  zone: ReturnType<typeof parseZone>;
}

interface ProviderRow {
  id: string;
  directory: string;
  challengeType: string;
  contact: string[];
}

interface CertRow {
  sans: string[];
  notValidBefore: string;
  notValidAfter: string;
}

interface Loaded {
  domains: DomainRow[];
  providers: ProviderRow[];
  certs: CertRow[];
  serverName: string;
}

type Check = { name: string; state: NameState | 'checking' | 'error'; addresses: string[] };

async function load(): Promise<Loaded> {
  const get = (obj: string, args: Record<string, unknown>, id: string) =>
    [`${obj}/get`, { accountId: getAccountId(obj), ...args }, id] as [string, Record<string, unknown>, string];
  const res = await jmapRequest([
    get('x:Domain', { ids: null, properties: ['name', 'certificateManagement', 'dnsManagement', 'dnsZoneFile'] }, 'd'),
    get('x:AcmeProvider', { ids: null, properties: ['directory', 'challengeType', 'contact'] }, 'p'),
    get(
      'x:Certificate',
      { ids: null, properties: ['subjectAlternativeNames', 'notValidBefore', 'notValidAfter'] },
      'c',
    ),
    get('x:SystemSettings', { ids: ['singleton'], properties: ['defaultHostname'] }, 's'),
  ]);
  const list = (id: string) =>
    (res.find(([, , i]) => i === id)?.[1] as { list?: Record<string, unknown>[] } | undefined)?.list ?? [];
  const keys = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object) : []);
  return {
    domains: list('d')
      .map((d) => {
        const cm = (d.certificateManagement ?? {}) as Record<string, unknown>;
        const dm = (d.dnsManagement ?? {}) as Record<string, unknown>;
        return {
          id: String(d.id),
          name: String(d.name),
          automatic: cm['@type'] === 'Automatic',
          providerId: cm.acmeProviderId as string | undefined,
          dnsAutomatic: dm['@type'] === 'Automatic',
          zone: parseZone(d.dnsZoneFile as string | undefined),
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
    providers: list('p').map((p) => ({
      id: String(p.id),
      directory: String(p.directory ?? ''),
      challengeType: String(p.challengeType ?? ''),
      contact: keys(p.contact).map((c) => c.replace(/^mailto:/, '')),
    })),
    certs: list('c').map((c) => ({
      sans: keys(c.subjectAlternativeNames).map((s) => s.toLowerCase()),
      notValidBefore: String(c.notValidBefore ?? ''),
      notValidAfter: String(c.notValidAfter ?? ''),
    })),
    serverName: String(list('s')[0]?.defaultHostname ?? ''),
  };
}

/** When the switch happened, read in the click handler, for telling a new certificate from an old one. */
async function switchedAt(): Promise<number> {
  return Date.now();
}

/** The newest certificate covering every one of these names. */
function coveringCert(certs: CertRow[], names: string[]): CertRow | undefined {
  return certs
    .filter((c) => names.every((n) => c.sans.includes(n.toLowerCase())))
    .sort((a, b) => b.notValidAfter.localeCompare(a.notValidAfter))[0];
}

/** The newest certificate covering any of these names: what the domain uses today. */
function currentCert(certs: CertRow[], names: string[]): CertRow | undefined {
  return certs
    .filter((c) => names.some((n) => c.sans.includes(n.toLowerCase())))
    .sort((a, b) => b.notValidAfter.localeCompare(a.notValidAfter))[0];
}

async function resolveAddresses(name: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA']) {
    const r = await dohQuery(name.replace(/^\*\./, ''), type);
    out.push(...r.answer.filter((a) => a.type === 1 || a.type === 28).map((a) => a.data));
  }
  return out;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function StateIcon({ state }: { state: Check['state'] }) {
  if (state === 'ok') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (state === 'checking') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
  if (state === 'error') return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
}

export function CertificateSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const section = viewToSection['x:Certificate'] ?? 'Settings';

  const [data, setData] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [checks, setChecks] = useState<Record<string, Check[]>>({});
  const [serverAddresses, setServerAddresses] = useState<string[] | null>(null);
  const [anyway, setAnyway] = useState<Set<string>>(new Set());
  const [staging, setStaging] = useState(false);
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [watch, setWatch] = useState<{ certs: CertRow[]; tasks: Record<string, unknown>[]; at: number } | null>(null);
  const [watching, setWatching] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let live = true;
    load()
      .then((d) => {
        if (!live) return;
        setData(d);
        setPicked(new Set(d.domains.filter((x) => !x.automatic).map((x) => x.id)));
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
      { id: 'domains', title: t('certSetup.stepDomains', 'Domains') },
      { id: 'check', title: t('certSetup.stepCheck', 'Check names') },
      { id: 'account', title: t('certSetup.stepAccount', 'Account') },
      { id: 'review', title: t('certSetup.stepReview', 'Review') },
      { id: 'watch', title: t('certSetup.stepWatch', 'Watch them arrive') },
    ],
    [t],
  );

  const chosen = useMemo(() => (data ? data.domains.filter((d) => picked.has(d.id)) : []), [data, picked]);
  const methodOf = (d: DomainRow): Method => (d.dnsAutomatic ? 'dns' : 'tls');
  const namesOf = useCallback(
    (d: DomainRow) => orderNames(d.name, methodOf(d), data?.serverName ?? '', d.zone),
    [data],
  );

  const runChecks = useCallback(async () => {
    if (!data) return;
    const tlsDomains = chosen.filter((d) => methodOf(d) === 'tls');
    const initial: Record<string, Check[]> = {};
    for (const d of tlsDomains) initial[d.id] = namesOf(d).map((name) => ({ name, state: 'checking', addresses: [] }));
    setChecks(initial);
    // Where this server is: its own name, or the domain's mail host.
    const anchor =
      data.serverName ||
      tlsDomains[0]?.zone
        .find((r) => r.type === 'MX')
        ?.value.split(/\s+/)
        .pop() ||
      '';
    const mine = anchor ? await resolveAddresses(anchor).catch(() => []) : [];
    setServerAddresses(mine);
    for (const d of tlsDomains) {
      const results = await Promise.all(
        namesOf(d).map(async (name): Promise<Check> => {
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
      setChecks((c) => ({ ...c, [d.id]: results }));
    }
  }, [chosen, data, namesOf]);

  const blocked = (d: DomainRow) =>
    methodOf(d) === 'tls' &&
    (checks[d.id] ?? []).some((c) => c.state !== 'ok' && c.state !== 'error') &&
    !anyway.has(d.id);
  const going = chosen.filter((d) => !blocked(d));

  const directory = staging ? LE_STAGING : LE_PRODUCTION;
  const methodsNeeded = [...new Set(going.map(methodOf))];
  const providerFor = (m: Method) =>
    data?.providers.find((p) => p.directory === directory && p.challengeType === CHALLENGE[m]);
  const needsNewProvider = methodsNeeded.some((m) => !providerFor(m));

  const poll = useCallback(async () => {
    const [certRes] = await jmapRequest([
      [
        'x:Certificate/get',
        {
          accountId: getAccountId('x:Certificate'),
          ids: null,
          properties: ['subjectAlternativeNames', 'notValidBefore', 'notValidAfter'],
        },
        'c',
      ],
    ]);
    const [, taskRes] = await jmapQueryAndGet(
      'x:Task',
      getAccountId('x:Task'),
      { filter: { '@type': 'AcmeRenewal' } },
      ['@type', 'domainId', 'status'],
    );
    const keys = (v: unknown) => (v && typeof v === 'object' ? Object.keys(v as object) : []);
    const certs = (
      ((certRes?.[1] as { list?: Record<string, unknown>[] })?.list ?? []) as Record<string, unknown>[]
    ).map((c) => ({
      sans: keys(c.subjectAlternativeNames).map((s) => s.toLowerCase()),
      notValidBefore: String(c.notValidBefore ?? ''),
      notValidAfter: String(c.notValidAfter ?? ''),
    }));
    const tasks = (
      ((taskRes?.[1] as { list?: Record<string, unknown>[] })?.list ?? []) as Record<string, unknown>[]
    ).filter((x) => x['@type'] === 'AcmeRenewal');
    setWatch({ certs, tasks, at: Date.now() });
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

  const apply = async () => {
    if (!data) return;
    setBusy(true);
    setError(null);
    const made: string[] = [];
    try {
      const ids: Partial<Record<Method, string>> = {};
      for (const m of methodsNeeded) {
        const existing = providerFor(m);
        if (existing) {
          ids[m] = existing.id;
          continue;
        }
        const [res] = await jmapSet('x:AcmeProvider', getAccountId('x:AcmeProvider'), {
          create: {
            acme: {
              directory,
              challengeType: CHALLENGE[m],
              contact: { [contact.trim()]: true },
              description: `${staging ? 'Let’s Encrypt (staging)' : 'Let’s Encrypt'}, ${m === 'dns' ? 'DNS-01' : 'TLS-ALPN-01'}, ${contact.trim()}`,
            },
          },
        });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const id = (body?.created?.acme as { id?: string } | undefined)?.id;
        if (!id) {
          const e = body?.notCreated ? Object.values(body.notCreated)[0] : undefined;
          throw new Error(e?.description ?? e?.type ?? 'The Let’s Encrypt account could not be added.');
        }
        ids[m] = id;
        made.push(id);
      }
      const update = Object.fromEntries(
        going.map((d) => [
          d.id,
          {
            certificateManagement: {
              '@type': 'Automatic',
              acmeProviderId: ids[methodOf(d)],
              subjectAlternativeNames: {},
            },
          },
        ]),
      );
      const [res] = await jmapSet('x:Domain', getAccountId('x:Domain'), { update });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const refused = Object.entries(body?.notUpdated ?? {});
      if (refused.length === going.length) {
        const e = refused[0]?.[1];
        throw new Error(e?.description ?? e?.type ?? 'The domains could not be switched to automatic certificates.');
      }
      if (refused.length > 0) {
        const names = refused.map(([id]) => data.domains.find((d) => d.id === id)?.name ?? id).join(', ');
        setError(t('certSetup.partial', 'These domains were not switched: {{names}}', { names }));
      }
      setStartedAt(await switchedAt());
      setStep(4);
      startWatching();
    } catch (e) {
      // Failsafe: an account added for this run is removed again when nothing uses it.
      for (const id of made) {
        await jmapSet('x:AcmeProvider', getAccountId('x:AcmeProvider'), { destroy: [id] }).catch(() => undefined);
      }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <div className="mx-auto max-w-3xl p-8 text-center text-destructive">{loadError}</div>;
  if (!data) return <LoadingFallback />;

  const domainsView = `/${viewToSection['x:Domain'] ?? 'Management'}/x:Domain`;
  const common = {
    icon: 'shield-check',
    title: t('certSetup.title', 'Certificates, automatically'),
    subtitle: t(
      'certSetup.subtitle',
      'Free certificates from Let’s Encrypt for your domains, renewed by the server before they expire.',
    ),
    steps,
    current: step,
    onCancel: () => navigate(`/${section}/x:Certificate`),
  };

  // ── Step 1: domains ──
  if (step === 0) {
    return (
      <WizardShell
        {...common}
        canNext={chosen.length > 0}
        onNext={() => {
          setStep(1);
          void runChecks();
        }}
        aside={
          <WizardNote title={t('certSetup.howTitle', 'How the server proves it’s yours')}>
            <p>
              {t(
                'certSetup.howDns',
                'A domain whose DNS is connected is checked through DNS: the certificate covers the domain and everything under it (*.domain), and nothing needs to reach this server.',
              )}
            </p>
            <p>
              {t(
                'certSetup.howTls',
                'Otherwise Let’s Encrypt connects to this server on port 443 for each name. Those names must point straight at this server, not through a proxy.',
              )}
            </p>
          </WizardNote>
        }
      >
        {data.domains.length === 0 ? (
          <p className="text-sm">
            {t('certSetup.noDomains', 'There are no domains yet.')}{' '}
            <Link className="text-primary hover:underline" to={domainsView}>
              {t('certSetup.addDomain', 'Add one first')}
            </Link>
          </p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {data.domains.map((d) => {
              const cert = currentCert(data.certs, namesOf(d));
              return (
                <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                  <Checkbox
                    id={`dom-${d.id}`}
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
                  <label htmlFor={`dom-${d.id}`} className="min-w-0 flex-1">
                    <span className="font-medium">{d.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      {d.automatic
                        ? t('certSetup.alreadyAuto', 'Already automatic.')
                        : t('certSetup.manual', 'Certificates managed by hand.')}{' '}
                      {cert
                        ? t('certSetup.validUntil', 'Current certificate valid until {{date}}.', {
                            date: fmtDate(cert.notValidAfter),
                          })
                        : t('certSetup.noCert', 'No certificate yet.')}{' '}
                      {methodOf(d) === 'dns'
                        ? t('certSetup.viaDns', 'Checked through DNS.')
                        : t('certSetup.viaTls', 'Checked on port 443.')}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </WizardShell>
    );
  }

  // ── Step 2: check names ──
  if (step === 1) {
    const tlsDomains = chosen.filter((d) => methodOf(d) === 'tls');
    const pending = tlsDomains.some((d) => (checks[d.id] ?? []).some((c) => c.state === 'checking'));
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        canNext={!pending && going.length > 0}
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
                  'certSetup.whyAllText',
                  'One certificate covers all of a domain’s names. If a single name fails, the whole order fails and keeps retrying.',
                )}
              </p>
            </WizardNote>
          </>
        }
      >
        {chosen
          .filter((d) => methodOf(d) === 'dns')
          .map((d) => (
            <p key={d.id} className="flex items-center gap-2 text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              {t('certSetup.dnsReady', '{{domain}}: checked through its connected DNS, covering {{names}}.', {
                domain: d.name,
                names: namesOf(d).join(' and '),
              })}
            </p>
          ))}
        {serverAddresses !== null && serverAddresses.length === 0 && tlsDomains.length > 0 && (
          <p className="flex items-start gap-2 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t(
              'certSetup.noAnchor',
              'This server’s own address couldn’t be looked up, so names are only checked for existing.',
            )}
          </p>
        )}
        {tlsDomains.map((d) => {
          const list = checks[d.id] ?? [];
          const problems = list.filter((c) => c.state !== 'ok' && c.state !== 'checking' && c.state !== 'error');
          return (
            <div key={d.id} className="space-y-2 rounded-xl border p-4">
              <p className="font-medium">{d.name}</p>
              <ul className="space-y-1 text-sm">
                {list.map((c) => (
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
              {problems.length > 0 && (
                <div className="space-y-2 border-t pt-3 text-sm">
                  <p>
                    {t('certSetup.fixOr', 'Fix those names in DNS and check again, or')}{' '}
                    <Link
                      className="text-primary hover:underline"
                      to={`/${viewToSection['x:Domain'] ?? 'Management'}/Wizard/dns/${d.id}`}
                    >
                      {t('certSetup.connectDns', 'connect this domain’s DNS')}
                    </Link>{' '}
                    {t('certSetup.connectDnsWhy', 'so it’s checked through DNS instead.')}
                  </p>
                  <label className="flex items-center gap-2">
                    <Checkbox
                      checked={anyway.has(d.id)}
                      onCheckedChange={(v) =>
                        setAnyway((s) => {
                          const n = new Set(s);
                          if (v) n.add(d.id);
                          else n.delete(d.id);
                          return n;
                        })
                      }
                    />
                    {t('certSetup.anyway', 'Order anyway (it will keep retrying until the names are fixed)')}
                  </label>
                </div>
              )}
            </div>
          );
        })}
        {tlsDomains.length > 0 && (
          <Button type="button" variant="outline" onClick={() => void runChecks()} disabled={pending}>
            <RefreshCw className={cn('h-4 w-4', pending && 'animate-spin')} />
            {t('certSetup.checkAgain', 'Check again')}
          </Button>
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
        canNext={!needsNewProvider || validEmail}
        aside={
          <WizardNote title={t('certSetup.stagingTitle', 'A practice run')}>
            <p>
              {t(
                'certSetup.stagingText',
                'Let’s Encrypt’s staging service issues certificates that browsers don’t trust, with far looser limits. Use it to see everything work, then run this guide again without it.',
              )}
            </p>
          </WizardNote>
        }
      >
        {needsNewProvider ? (
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
        ) : (
          <p className="text-sm">
            {t('certSetup.reuse', 'The Let’s Encrypt account already set up on this server will be used.')}
          </p>
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
    const skipped = chosen.filter(blocked);
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(2)}
        onNext={() => void apply()}
        nextLabel={t('certSetup.apply', 'Switch them to automatic')}
        canNext={going.length > 0}
        busy={busy}
        aside={
          <WizardNote tone="undo" title={t('certSetup.undoTitle', 'Changing your mind')}>
            <p>
              {t(
                'certSetup.undo',
                'Set a domain’s Certificate management back to Manual. Certificates already issued stay until they expire.',
              )}
            </p>
          </WizardNote>
        }
      >
        <div className="space-y-2">
          <p className="font-medium">{t('certSetup.willChange', 'What will change')}</p>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {needsNewProvider && (
              <li>
                {t('certSetup.newAccount', 'A Let’s Encrypt {{kind}}account is added for {{email}}.', {
                  kind: staging ? t('certSetup.stagingWord', 'staging ') : '',
                  email: contact.trim(),
                })}
              </li>
            )}
            {going.map((d) => (
              <li key={d.id}>
                {t(
                  'certSetup.domainAuto',
                  '{{domain}} gets its certificate automatically, checked {{how}}: {{names}}.',
                  {
                    domain: d.name,
                    how:
                      methodOf(d) === 'dns'
                        ? t('certSetup.howDnsWord', 'through DNS')
                        : t('certSetup.howTlsWord', 'on port 443'),
                    names: namesOf(d).join(', '),
                  },
                )}
              </li>
            ))}
          </ul>
        </div>
        {skipped.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('certSetup.skipped', 'Left as they are until their names are fixed: {{names}}.', {
              names: skipped.map((d) => d.name).join(', '),
            })}
          </p>
        )}
        {error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </WizardShell>
    );
  }

  // ── Step 5: watch ──
  const rows = going.map((d) => {
    const names = namesOf(d);
    const cert = watch ? coveringCert(watch.certs, names) : undefined;
    const fresh = cert && startedAt !== null && new Date(cert.notValidBefore).getTime() > startedAt - 2 * 3600_000;
    const task = watch?.tasks.find((x) => x.domainId === d.id);
    const status = (task?.status ?? {}) as Record<string, unknown>;
    const due = typeof status.due === 'string' ? new Date(status.due).getTime() : null;
    let state: { icon: Check['state']; text: string };
    if (fresh) {
      state = {
        icon: 'ok',
        text: t('certSetup.issued', 'Issued. Valid until {{date}}.', { date: fmtDate(cert.notValidAfter) }),
      };
    } else if (status['@type'] === 'Failed') {
      state = { icon: 'missing', text: String(status.failureReason ?? t('certSetup.failed', 'Failed.')) };
    } else if (status['@type'] === 'Retry') {
      state = {
        icon: 'checking',
        text: t('certSetup.retrying', 'Retrying: {{reason}}', { reason: String(status.failureReason ?? '') }),
      };
    } else if (cert && due !== null && watch && due > watch.at + 3600_000) {
      state = {
        icon: 'ok',
        text: t(
          'certSetup.coveredAlready',
          'Already covered by a certificate valid until {{date}}; it renews on {{due}}.',
          {
            date: fmtDate(cert.notValidAfter),
            due: fmtDate(String(status.due)),
          },
        ),
      };
    } else {
      state = { icon: 'checking', text: t('certSetup.waiting', 'Ordering…') };
    }
    return { d, state };
  });
  const allDone = rows.length > 0 && rows.every((r) => r.state.icon !== 'checking');

  return (
    <WizardShell
      {...common}
      onNext={() => navigate(`/${section}/x:Certificate`)}
      nextLabel={t('wizard.finish', 'Finish')}
      aside={
        <WizardNote title={t('certSetup.afterTitle', 'From now on')}>
          <p>
            {t(
              'certSetup.after',
              'The server renews each certificate well before it expires. Failed renewals show under Management › Tasks › Failed.',
            )}
          </p>
        </WizardNote>
      }
    >
      <ul className="space-y-2 text-sm">
        {rows.map(({ d, state }) => (
          <li key={d.id} className="flex items-start gap-2">
            <StateIcon state={state.icon} />
            <span className="font-medium">{d.name}</span>
            <span className="text-muted-foreground">{state.text}</span>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {!allDone && !watching && (
        <Button type="button" variant="outline" onClick={startWatching}>
          <RefreshCw className="h-4 w-4" />
          {t('certSetup.keepWatching', 'Keep watching')}
        </Button>
      )}
      {!allDone && watching && (
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {t('certSetup.watchingHint', 'Checking every few seconds. Most certificates arrive within a minute.')}
        </p>
      )}
    </WizardShell>
  );
}
