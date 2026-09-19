/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ChevronDown,
  ClipboardCopy,
  ClipboardList,
  ExternalLink,
  Loader2,
  PlugZap,
  Radar,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Combobox } from '@/components/ui/combobox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WizardNote, WizardShell, type WizardStep } from '@/components/wizard/WizardShell';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useSchemaStore } from '@/stores/schemaStore';
import { getAccountId, jmapGet, jmapSet } from '@/services/jmap/client';
import { friendlySetError } from '@/lib/jmapErrors';
import { humanize } from '@/lib/humanize';
import { cn } from '@/lib/utils';
import type { Field, Schema } from '@/types/schema';
import type { JmapSetError, JmapSetResponse } from '@/types/jmap';
import { ADVANCED_FIELDS, FEATURED, HIDDEN_VARIANTS, type ProviderGuide } from './providers';
import { DEFAULT_KINDS, RECORD_GROUPS } from './records';
import { parseZone, summarizeFailure, type RecordKind, type ZoneRecord } from './zone';
import { RESOLVER_NAME, type LiveState } from './liveCheck';
import { detectHosting, type DnsHosting } from './detect';
import { useRecordChecks } from './useRecordChecks';
import { CopyStep } from './CopyStep';
import { ProgressRing, StateIcon } from './parts';

export interface DomainInfo {
  id: string;
  name: string;
  dnsManagement?: {
    '@type': string;
    dnsServerId?: string;
    origin?: string | null;
    publishRecords?: Record<string, boolean>;
  };
  dnsZoneFile?: string;
}

interface ServerInfo {
  id: string;
  '@type': string;
  description?: string;
}

type Choice = { mode: 'existing'; id: string } | { mode: 'new'; variant: string };

const STEPS = (t: (k: string, d: string) => string): WizardStep[] => [
  { id: 'provider', title: t('dnsWizard.stepProvider', 'Your DNS host') },
  { id: 'connect', title: t('dnsWizard.stepConnect', 'Connect') },
  { id: 'records', title: t('dnsWizard.stepRecords', 'Records') },
  { id: 'review', title: t('dnsWizard.stepReview', 'Review') },
  { id: 'live', title: t('dnsWizard.stepLive', 'Go live') },
];

/** Field kinds the guided form can take; anything else sends the user to the full form. */
type Simple = 'string' | 'number' | 'boolean' | 'enum' | 'secret' | 'secretOptional' | 'secretText';

function simpleKind(field: Field): Simple | null {
  const ty = field.type as { type: string; format?: string; objectName?: string };
  if (ty.type === 'string') return 'string';
  if (ty.type === 'number' && ty.format !== 'duration') return 'number';
  if (ty.type === 'boolean') return 'boolean';
  if (ty.type === 'enum') return 'enum';
  if (ty.type === 'object' && ty.objectName === 'x:SecretKey') return 'secret';
  if (ty.type === 'object' && ty.objectName === 'x:SecretKeyOptional') return 'secretOptional';
  if (ty.type === 'object' && ty.objectName === 'x:SecretText') return 'secretText';
  return null;
}

function variantFields(schema: Schema, variant: string, guide?: ProviderGuide) {
  const sch = schema.schemas['x:DnsServer'];
  const schemaName = sch?.type === 'multiple' ? sch.variants.find((v) => v.name === variant)?.schemaName : undefined;
  const fields = schemaName ? schema.fields[schemaName] : undefined;
  const entries = Object.entries(fields?.properties ?? {}).filter(
    ([name]) => !ADVANCED_FIELDS.has(name) && !(guide?.variant === 'Cloudflare' && name === 'email'),
  );
  return {
    defaults: fields?.defaults ?? {},
    fields: entries.map(([name, field]) => ({ name, field, kind: simpleKind(field) })),
  };
}

function isOptional(field: Field, kind: Simple | null): boolean {
  return kind === 'secretOptional' || Boolean((field.type as { nullable?: boolean }).nullable);
}

function payloadValue(kind: Simple, raw: string | boolean): unknown {
  switch (kind) {
    case 'secret':
      return { '@type': 'Value', secret: raw };
    case 'secretOptional':
      return raw ? { '@type': 'Value', secret: raw } : { '@type': 'None' };
    case 'secretText':
      return { '@type': 'Text', secret: raw };
    case 'number':
      return Number(raw);
    default:
      return raw;
  }
}

function setError(res: JmapSetResponse | undefined, key: 'notCreated' | 'notUpdated' | 'notDestroyed'): string | null {
  const errs = res?.[key] as Record<string, JmapSetError> | null | undefined;
  const first = errs ? Object.values(errs)[0] : undefined;
  return first ? friendlySetError(first) : null;
}

export function ConnectDnsPage({ domainId }: { domainId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const schema = useSchemaStore((s) => s.schema);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const steps = useMemo(() => STEPS(t), [t]);
  const copySteps = useMemo(
    () => [steps[0], { id: 'copy', title: t('dnsWizard.stepCopy', 'Add the records') }],
    [steps, t],
  );

  const [step, setStep] = useState(0);
  const [domain, setDomain] = useState<DomainInfo | null>(null);
  const [servers, setServers] = useState<ServerInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [kinds, setKinds] = useState<Set<RecordKind>>(new Set(DEFAULT_KINDS));
  const [origin, setOrigin] = useState('');
  const [showZone, setShowZone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setErrorText] = useState<string | null>(null);

  const domainView = `/${viewToSection['x:Domain'] ?? 'Management'}/x:Domain/${domainId}`;

  const load = useCallback(async () => {
    const [domainRes] = await jmapGet(
      'x:Domain',
      getAccountId('x:Domain'),
      [domainId],
      ['name', 'dnsManagement', 'dnsZoneFile'],
    );
    const list = (domainRes?.[1] as { list?: DomainInfo[] })?.list ?? [];
    return list[0] ?? null;
  }, [domainId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await load();
        if (cancelled) return;
        if (!d) {
          setLoadError(t('dnsWizard.noDomain', 'That domain no longer exists.'));
          return;
        }
        setDomain(d);
        const current = d.dnsManagement;
        if (current?.['@type'] === 'Automatic') {
          if (current.dnsServerId) setChoice({ mode: 'existing', id: current.dnsServerId });
          if (current.publishRecords) {
            setKinds(
              new Set(Object.keys(current.publishRecords).filter((k) => current.publishRecords?.[k]) as RecordKind[]),
            );
          }
          setOrigin(current.origin ?? '');
        }
        const [srvRes] = await jmapGet('x:DnsServer', getAccountId('x:DnsServer'), null, ['@type', 'description']);
        if (!cancelled) setServers(((srvRes?.[1] as { list?: ServerInfo[] })?.list ?? []) as ServerInfo[]);
      } catch (e) {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, t]);

  const zone = useMemo(() => parseZone(domain?.dnsZoneFile), [domain]);

  // Where the domain's DNS lives, looked up once it's loaded. undefined while
  // looking, null when it isn't in public DNS (or the lookup failed).
  const [hosting, setHosting] = useState<DnsHosting | null | undefined>(undefined);
  const [showAll, setShowAll] = useState(false);
  const [path, setPath] = useState<'connect' | 'copy'>('connect');
  const domainName = domain?.name;
  useEffect(() => {
    if (!domainName) return;
    const ctrl = new AbortController();
    detectHosting(domainName, ctrl.signal)
      .then((h) => {
        setHosting(h);
        // A domain inside a bigger zone needs the zone named for the API.
        if (h && h.zone !== domainName.toLowerCase()) setOrigin((o) => o || h.zone);
      })
      .catch(() => {
        if (!ctrl.signal.aborted) setHosting(null);
      });
    return () => ctrl.abort();
  }, [domainName]);

  const variants = useMemo(() => {
    const sch = schema?.schemas['x:DnsServer'];
    return sch?.type === 'multiple' ? sch.variants.filter((v) => !HIDDEN_VARIANTS.has(v.name)) : [];
  }, [schema]);
  const labelOf = (variant: string) =>
    FEATURED.find((f) => f.variant === variant)?.name ??
    variants.find((v) => v.name === variant)?.label ??
    humanize(variant);

  const guide = choice?.mode === 'new' ? FEATURED.find((f) => f.variant === choice.variant) : undefined;
  const form = useMemo(
    () => (schema && choice?.mode === 'new' ? variantFields(schema, choice.variant, guide) : null),
    [schema, choice, guide],
  );
  const unsupported = form?.fields.some((f) => f.kind === null && !isOptional(f.field, f.kind)) ?? false;
  const credsComplete =
    form?.fields.every(({ name, field, kind }) => {
      if (!kind || isOptional(field, kind) || kind === 'boolean' || kind === 'enum') return true;
      if (form.defaults[name] !== undefined) return true;
      const v = values[name];
      return typeof v === 'string' && v.trim().length > 0;
    }) ?? false;

  // ── Finishing: create the provider if new, then switch the domain over. ──
  const [createdServerId, setCreatedServerId] = useState<string | null>(null);
  const finish = async () => {
    if (!domain || !choice) return;
    setBusy(true);
    setErrorText(null);
    let serverId = choice.mode === 'existing' ? choice.id : null;
    let madeServer: string | null = null;
    try {
      if (choice.mode === 'new' && form) {
        const create: Record<string, unknown> = {
          '@type': choice.variant,
          description: t('dnsWizard.providerDescription', '{{provider}} for {{domain}}', {
            provider: labelOf(choice.variant),
            domain: domain.name,
          }),
        };
        for (const { name, kind } of form.fields) {
          if (!kind) continue;
          const raw = values[name];
          if (raw === undefined || raw === '') {
            if (kind === 'secretOptional') create[name] = { '@type': 'None' };
            continue;
          }
          create[name] = payloadValue(kind, raw);
        }
        const [res] = await jmapSet('x:DnsServer', getAccountId('x:DnsServer'), { create: { dns: create } });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const id = (body?.created?.dns as { id?: string } | undefined)?.id;
        if (!id)
          throw new Error(
            setError(body, 'notCreated') ?? t('dnsWizard.createFailed', 'The provider could not be saved.'),
          );
        serverId = id;
        madeServer = id;
      }
      const publishRecords = Object.fromEntries([...kinds].map((k) => [k, true]));
      const [res] = await jmapSet('x:Domain', getAccountId('x:Domain'), {
        update: {
          [domain.id]: {
            dnsManagement: {
              '@type': 'Automatic',
              dnsServerId: serverId,
              origin: origin.trim() || null,
              publishRecords,
            },
          },
        },
      });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const failed = setError(body, 'notUpdated');
      if (failed || !body?.updated || !(domain.id in body.updated)) {
        throw new Error(failed ?? t('dnsWizard.updateFailed', 'The domain could not be switched to automatic DNS.'));
      }
      setCreatedServerId(madeServer);
      setStep(4);
    } catch (e) {
      // Failsafe: a provider made for this run is removed again, so a failed
      // attempt leaves nothing behind.
      if (madeServer) {
        await jmapSet('x:DnsServer', getAccountId('x:DnsServer'), { destroy: [madeServer] }).catch(() => undefined);
      }
      setErrorText(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) {
    return <div className="mx-auto max-w-3xl p-8 text-center text-destructive">{loadError}</div>;
  }
  if (!domain || !schema) return <LoadingFallback />;

  const selectedRecords = zone.filter((r) => kinds.has(r.kind));
  const already = domain.dnsManagement?.['@type'] === 'Automatic';

  const common = {
    icon: 'globe',
    title: t('dnsWizard.title', 'Publish DNS for {{domain}}', { domain: domain.name }),
    subtitle: t('dnsWizard.subtitle', 'Connect your DNS host once, and the server keeps these records right for you.'),
    steps,
    current: step,
    onCancel: () => navigate(domainView),
  };

  // ── Step 1: where is DNS hosted? ──
  if (step === 0) {
    const pick = (c: Choice) => {
      setPath('connect');
      setChoice(c);
      setValues({});
      setStep(c.mode === 'existing' ? 2 : 1);
    };
    const copyByHand = () => {
      setPath('copy');
      setStep(1);
    };
    const detected = hosting?.variant && variants.some((v) => v.name === hosting.variant) ? hosting.variant : null;
    const connectedSame = detected ? servers.filter((s) => s['@type'] === detected) : [];
    const hostName = hosting?.nameservers[0]?.split('.').slice(-2).join('.');

    return (
      <WizardShell
        {...common}
        aside={
          <WizardNote title={t('dnsWizard.whatTitle', 'What this does')}>
            <p>
              {t(
                'dnsWizard.whatBody',
                'Your mail server writes its own DNS records through your DNS host’s API: mail routing, the records that prove your mail is yours, and the ones mail apps use to set themselves up.',
              )}
            </p>
            <p>
              {t(
                'dnsWizard.whatKeep',
                'When keys rotate or settings change, it updates them again. Nothing is changed until the last step.',
              )}
            </p>
          </WizardNote>
        }
      >
        {hosting === undefined ? (
          <div className="flex items-center gap-3 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            {t('dnsWizard.detecting', 'Looking up where {{domain}}’s DNS is hosted…', { domain: domain.name })}
          </div>
        ) : detected ? (
          <section className="space-y-4">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
                <Radar className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">
                  {t('dnsWizard.foundAt', '{{domain}}’s DNS is at {{provider}}', {
                    domain: domain.name,
                    provider: labelOf(detected),
                  })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {hosting && hosting.zone !== domain.name.toLowerCase()
                    ? t('dnsWizard.foundZone', 'In the {{zone}} zone, served by {{ns}}.', {
                        zone: hosting.zone,
                        ns: hosting.nameservers.join(', '),
                      })
                    : t('dnsWizard.foundNs', 'Served by {{ns}}.', { ns: hosting?.nameservers.join(', ') })}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {connectedSame.map((srv) => (
                <Button key={srv.id} onClick={() => pick({ mode: 'existing', id: srv.id })}>
                  {t('dnsWizard.useExisting', 'Use “{{name}}”', { name: srv.description || labelOf(srv['@type']) })}
                </Button>
              ))}
              <Button
                variant={connectedSame.length ? 'outline' : 'default'}
                onClick={() => pick({ mode: 'new', variant: detected })}
              >
                <PlugZap className="h-4 w-4" />
                {connectedSame.length
                  ? t('dnsWizard.connectAnother', 'Connect with a new key')
                  : t('dnsWizard.connectDetected', 'Connect {{provider}}', { provider: labelOf(detected) })}
              </Button>
              <Button variant="ghost" onClick={copyByHand}>
                <ClipboardCopy className="h-4 w-4" />
                {t('dnsWizard.byHand', 'Add the records by hand instead')}
              </Button>
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            <div className="flex items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-700 dark:text-amber-300">
                <ClipboardList className="h-6 w-6" />
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">
                  {hosting
                    ? t('dnsWizard.unsupportedHost', '{{domain}}’s DNS is at {{host}}', {
                        domain: domain.name,
                        host: hostName,
                      })
                    : t('dnsWizard.notFound', '{{domain}} isn’t in public DNS yet', { domain: domain.name })}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {hosting
                    ? t(
                        'dnsWizard.unsupportedHint',
                        'The server can’t update that host for you, but adding the records by hand takes a few minutes, and this page checks each one as it goes live.',
                      )
                    : t(
                        'dnsWizard.notFoundHint',
                        'Once it’s registered and pointed at a DNS host, you can add the records by hand or connect the host here.',
                      )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button onClick={copyByHand}>
                <ClipboardCopy className="h-4 w-4" />
                {t('dnsWizard.showRecords2', 'Show me the records')}
              </Button>
            </div>
          </section>
        )}

        {hosting !== undefined && (
          <div className="border-t pt-4">
            {!showAll ? (
              <button
                type="button"
                onClick={() => setShowAll(true)}
                className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                {detected
                  ? t('dnsWizard.notRight', 'Not right? Choose your DNS host')
                  : t('dnsWizard.chooseHost', 'Using a host the server can update? Choose it')}
              </button>
            ) : (
              <div className="space-y-3">
                {servers.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {servers.map((srv) => (
                      <Button
                        key={srv.id}
                        variant="outline"
                        size="sm"
                        onClick={() => pick({ mode: 'existing', id: srv.id })}
                      >
                        {srv.description || labelOf(srv['@type'])}
                      </Button>
                    ))}
                  </div>
                )}
                <div className="max-w-sm space-y-1.5">
                  <Label className="text-sm text-muted-foreground">{t('dnsWizard.yourHost', 'Your DNS host')}</Label>
                  <Combobox
                    options={[
                      ...FEATURED.filter((f) => variants.some((v) => v.name === f.variant)).map((f) => ({
                        value: f.variant,
                        label: f.name,
                      })),
                      ...variants
                        .filter((v) => !FEATURED.some((f) => f.variant === v.name))
                        .map((v) => ({ value: v.name, label: v.label })),
                    ]}
                    value=""
                    onValueChange={(v) => v && pick({ mode: 'new', variant: v })}
                    placeholder={t('dnsWizard.searchHosts', 'Search {{count}} DNS hosts…', { count: variants.length })}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </WizardShell>
    );
  }

  // ── By hand: copy each record, and watch it go live ──
  if (step === 1 && path === 'copy') {
    return (
      <CopyStep
        common={{ ...common, steps: copySteps }}
        domain={domain}
        zoneName={hosting?.zone ?? domain.name.toLowerCase()}
        records={selectedRecords}
        onBack={() => setStep(0)}
        onDone={() => navigate(domainView)}
      />
    );
  }

  // ── Step 2: credentials ──
  if (step === 1 && choice?.mode === 'new' && form) {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        canNext={credsComplete && !unsupported}
        aside={
          <>
            <WizardNote title={t('dnsWizard.keepNarrow', 'Keep the key narrow')}>
              <p>
                {t(
                  'dnsWizard.keepNarrowBody',
                  'Give the server a credential that can edit DNS for this domain and nothing else. If it ever leaked, that’s all it could touch.',
                )}
              </p>
            </WizardNote>
            <WizardNote title={t('dnsWizard.storedTitle', 'Where it’s kept')}>
              <p>
                {t(
                  'dnsWizard.storedBody',
                  'It’s stored in the server’s settings and never shown again. You can replace or remove it on the DNS provider’s page.',
                )}
              </p>
            </WizardNote>
          </>
        }
      >
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300">
            <PlugZap className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-medium">{labelOf(choice.variant)}</h2>
            {guide && <p className="text-sm text-muted-foreground">{guide.blurb}</p>}
          </div>
        </div>
        {guide && (
          <ol className="space-y-2 rounded-xl bg-muted/50 p-4 text-sm">
            {guide.steps.map((s, i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
                  {i + 1}
                </span>
                <span>{s}</span>
              </li>
            ))}
            {guide.link && (
              <li className="pl-8">
                <a
                  href={guide.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
                >
                  {t('dnsWizard.openProvider', 'Open {{provider}}', { provider: guide.name })}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </li>
            )}
          </ol>
        )}
        {unsupported ? (
          <p className="rounded-xl border border-highlight/40 bg-highlight-soft p-4 text-sm">
            {t(
              'dnsWizard.unsupported',
              'This provider needs settings the guided setup can’t take. Add it on the DNS providers page, then come back and choose it here.',
            )}
          </p>
        ) : (
          <div className="space-y-5">
            {form.fields.map(({ name, field, kind }) =>
              kind ? (
                <CredentialField
                  key={name}
                  named={guide?.fields?.[name]}
                  schema={schema}
                  name={name}
                  field={field}
                  kind={kind}
                  fallback={form.defaults[name]}
                  value={values[name]}
                  onChange={(v) => setValues((prev) => ({ ...prev, [name]: v }))}
                />
              ) : null,
            )}
          </div>
        )}
      </WizardShell>
    );
  }

  // ── Step 3: which records ──
  if (step === 2) {
    const toggle = (k: RecordKind, on: boolean) =>
      setKinds((prev) => {
        const next = new Set(prev);
        if (on) next.add(k);
        else next.delete(k);
        return next;
      });
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(choice?.mode === 'new' ? 1 : 0)}
        onNext={() => setStep(3)}
        canNext={kinds.size > 0}
        aside={
          <WizardNote title={t('dnsWizard.recordsNote', 'Your other records are safe')}>
            <p>
              {t(
                'dnsWizard.recordsNoteBody',
                'Only the names listed here are written. Records the server doesn’t own, like your website or other TXT entries, are left as they are.',
              )}
            </p>
          </WizardNote>
        }
      >
        <div className="space-y-5">
          {RECORD_GROUPS.map((g) => (
            <section key={g.id} className="space-y-2">
              <div>
                <h2 className="font-medium">{g.title}</h2>
                <p className="text-sm text-muted-foreground">{g.why}</p>
              </div>
              <div className="divide-y rounded-xl border">
                {g.kinds.map(({ kind, label, caution }) => {
                  const count = zone.filter((r) => r.kind === kind).length;
                  return (
                    <label key={kind} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
                      <span className="min-w-0">
                        <span className="text-sm">{label}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {count === 0
                            ? t('dnsWizard.recordNone', 'none yet')
                            : t('dnsWizard.recordCount', {
                                count,
                                defaultValue_one: '{{count}} record',
                                defaultValue_other: '{{count}} records',
                              })}
                        </span>
                        {caution && <span className="block text-xs text-muted-foreground">{caution}</span>}
                      </span>
                      <Switch checked={kinds.has(kind)} onCheckedChange={(on) => toggle(kind, on)} />
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dns-origin">{t('dnsWizard.origin', 'DNS zone (optional)')}</Label>
          <Input
            id="dns-origin"
            value={origin}
            placeholder={domain.name}
            onChange={(e) => setOrigin(e.target.value)}
            className="max-w-sm"
          />
          <p className="text-xs text-muted-foreground">
            {t(
              'dnsWizard.originHint',
              'Only if {{domain}} lives inside a bigger zone at your host, for example mail.example.com kept in example.com.',
              { domain: domain.name },
            )}
          </p>
        </div>
      </WizardShell>
    );
  }

  // ── Step 4: review ──
  if (step === 3) {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(2)}
        onNext={finish}
        busy={busy}
        nextLabel={t('dnsWizard.publish', 'Connect and publish')}
        aside={
          <>
            <WizardNote title={t('dnsWizard.happensTitle', 'What happens next')}>
              <p>
                {choice?.mode === 'new'
                  ? t('dnsWizard.happensNew', 'The {{provider}} connection is saved,', {
                      provider: labelOf(choice.variant),
                    })
                  : t('dnsWizard.happensExisting', 'Your existing connection is used,')}{' '}
                {t(
                  'dnsWizard.happensRest',
                  '{{domain}} switches to automatic DNS, and the server starts writing records straight away. Most hosts show them within a minute or two.',
                  { domain: domain.name },
                )}
              </p>
            </WizardNote>
            <WizardNote tone="undo" title={t('dnsWizard.undoTitle', 'Changing your mind')}>
              <p>
                {t(
                  'dnsWizard.undoBody',
                  'If anything fails here, nothing is kept. Later, switching the domain back to manual stops all updates, and the records already written stay where they are.',
                )}
              </p>
            </WizardNote>
          </>
        }
      >
        <dl className="grid gap-4 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">{t('dnsWizard.reviewDomain', 'Domain')}</dt>
          <dd className="font-medium">{domain.name}</dd>
          <dt className="text-muted-foreground">{t('dnsWizard.reviewHost', 'DNS host')}</dt>
          <dd className="font-medium">
            {choice?.mode === 'existing'
              ? (servers.find((s) => s.id === choice.id)?.description ??
                labelOf(servers.find((s) => s.id === choice.id)?.['@type'] ?? ''))
              : choice
                ? labelOf(choice.variant)
                : ''}
          </dd>
          <dt className="text-muted-foreground">{t('dnsWizard.reviewRecords', 'Records')}</dt>
          <dd>
            <span className="font-medium">{selectedRecords.length}</span>{' '}
            <span className="text-muted-foreground">
              {t('dnsWizard.reviewGroups', 'across {{groups}}', {
                groups: RECORD_GROUPS.filter((g) => g.kinds.some((k) => kinds.has(k.kind)))
                  .map((g) => g.title.toLowerCase())
                  .join(', '),
              })}
            </span>
          </dd>
          {origin.trim() && (
            <>
              <dt className="text-muted-foreground">{t('dnsWizard.reviewZone', 'Zone')}</dt>
              <dd className="font-medium">{origin.trim()}</dd>
            </>
          )}
        </dl>
        {already && (
          <p className="text-sm text-muted-foreground">
            {t('dnsWizard.alreadyAuto', 'This domain already publishes automatically; this updates its settings.')}
          </p>
        )}
        <div>
          <button
            type="button"
            onClick={() => setShowZone((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            <ChevronDown className={cn('h-4 w-4 transition-transform', showZone && 'rotate-180')} />
            {showZone
              ? t('dnsWizard.hideRecords', 'Hide the records')
              : t('dnsWizard.showRecords', 'Show the exact records')}
          </button>
          {showZone && <RecordTable records={selectedRecords} />}
        </div>
        {error && (
          <p className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </p>
        )}
      </WizardShell>
    );
  }

  // ── Step 5: live ──
  return (
    <LiveStep
      common={common}
      domain={domain}
      records={selectedRecords}
      createdServerId={createdServerId}
      onDone={() => navigate(domainView)}
    />
  );
}

function CredentialField({
  named,
  schema,
  name,
  field,
  kind,
  fallback,
  value,
  onChange,
}: {
  named?: { label: string; hint?: string };
  schema: Schema;
  name: string;
  field: Field;
  kind: Simple;
  fallback: unknown;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}) {
  const { t } = useTranslation();
  const id = `cred-${name}`;
  const label = named?.label ?? humanize(name);
  const optional = isOptional(field, kind) || fallback !== undefined;
  const heading = (
    <Label htmlFor={id}>
      {label}
      {optional && (
        <span className="ml-1 font-normal text-muted-foreground">{t('dnsWizard.optional', '(optional)')}</span>
      )}
    </Label>
  );
  const hint = <p className="text-xs text-muted-foreground">{named?.hint ?? field.description}</p>;

  if (kind === 'boolean') {
    return (
      <div className="flex items-center justify-between gap-4">
        <div>
          {heading}
          {hint}
        </div>
        <Switch id={id} checked={value === undefined ? Boolean(fallback) : Boolean(value)} onCheckedChange={onChange} />
      </div>
    );
  }
  if (kind === 'enum') {
    const enumName = (field.type as { enumName: string }).enumName;
    const options = schema.enums[enumName] ?? [];
    return (
      <div className="space-y-1.5">
        {heading}
        <Select value={String(value ?? fallback ?? '')} onValueChange={onChange}>
          <SelectTrigger id={id} className="max-w-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.name} value={o.name}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {hint}
      </div>
    );
  }
  if (kind === 'secretText') {
    return (
      <div className="space-y-1.5">
        {heading}
        <Textarea
          id={id}
          rows={5}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs"
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
        />
        {hint}
      </div>
    );
  }
  const secret = kind === 'secret' || kind === 'secretOptional';
  return (
    <div className="space-y-1.5">
      {heading}
      <Input
        id={id}
        type={secret ? 'password' : kind === 'number' ? 'number' : 'text'}
        autoComplete={secret ? 'new-password' : 'off'}
        spellCheck={false}
        placeholder={typeof fallback === 'string' || typeof fallback === 'number' ? String(fallback) : undefined}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-md"
      />
      {hint}
    </div>
  );
}

function RecordTable({ records, states }: { records: ZoneRecord[]; states?: Map<ZoneRecord, LiveState> }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-xl border">
      <table className="w-full table-fixed text-left text-xs">
        <tbody className="divide-y">
          {records.map((r, i) => (
            <tr key={`${r.name}-${r.type}-${i}`} className="align-top">
              {states && (
                <td className="w-9 py-2 pl-3">
                  <StateIcon state={states.get(r)} />
                </td>
              )}
              <td className="w-[38%] truncate px-3 py-2 font-mono" title={r.name}>
                {r.name}
              </td>
              <td className="w-16 px-3 py-2 font-mono text-muted-foreground">{r.type}</td>
              <td className="truncate px-3 py-2 font-mono text-muted-foreground" title={r.value}>
                {r.value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LiveStep({
  common,
  domain,
  records,
  createdServerId,
  onDone,
}: {
  common: Omit<Parameters<typeof WizardShell>[0], 'children'>;
  domain: DomainInfo;
  records: ZoneRecord[];
  createdServerId: string | null;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const { states, task, checking, lastChecked, check, liveCount, allLive } = useRecordChecks(records, domain.id, true);

  const failed = task?.status?.['@type'] === 'Failed' || task?.status?.['@type'] === 'Retry';
  const failure = summarizeFailure(task?.status?.failureReason);
  const pct = records.length ? Math.round((liveCount / records.length) * 100) : 0;

  return (
    <WizardShell
      {...common}
      onNext={onDone}
      nextLabel={t('dnsWizard.done', 'Done')}
      aside={
        <>
          <WizardNote title={t('dnsWizard.howChecked', 'How this is checked')}>
            <p>
              {t(
                'dnsWizard.howCheckedBody',
                'Every few seconds this page asks {{resolver}} for each record, so a green tick means the whole internet can see it.',
                { resolver: RESOLVER_NAME },
              )}
            </p>
          </WizardNote>
          {createdServerId && (
            <WizardNote tone="undo" title={t('dnsWizard.undoTitle', 'Changing your mind')}>
              <p>
                {t(
                  'dnsWizard.undoLive',
                  'Switch the domain’s DNS management back to manual to stop updates. Records already written stay.',
                )}
              </p>
            </WizardNote>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-6">
        <ProgressRing pct={pct} done={allLive} />
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="text-lg font-semibold">
            {allLive
              ? t('dnsWizard.allLive', 'All set. {{domain}} is live.', { domain: domain.name })
              : t('dnsWizard.progress', '{{live}} of {{total}} records are live', {
                  live: liveCount,
                  total: records.length,
                })}
          </h2>
          <p className="text-sm text-muted-foreground">
            {failed
              ? t('dnsWizard.taskFailedShort', 'Your DNS host turned the update down.')
              : task
                ? t('dnsWizard.taskPending', 'The server is writing the records to your DNS host…')
                : allLive
                  ? t('dnsWizard.keepsUpdating', 'From now on the server keeps them up to date by itself.')
                  : t(
                      'dnsWizard.waiting',
                      'Written. Waiting for them to show up in public DNS, which can take a few minutes.',
                    )}
          </p>
          <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <Button variant="outline" size="sm" onClick={() => void check()} disabled={checking}>
              <RefreshCw className={cn('h-3.5 w-3.5', checking && 'animate-spin')} />
              {t('dnsWizard.checkNow', 'Check now')}
            </Button>
            {lastChecked &&
              t('dnsWizard.lastChecked', 'Last checked {{time}}', { time: lastChecked.toLocaleTimeString() })}
          </div>
        </div>
      </div>
      {failed && (
        <div className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="font-medium text-destructive">
            {failure.records > 0
              ? t('dnsWizard.failedRecords', {
                  count: failure.records,
                  defaultValue_one: '{{count}} record wasn’t written. Your DNS host said:',
                  defaultValue_other: '{{count}} records weren’t written. Your DNS host said:',
                })
              : t('dnsWizard.failedSaid', 'Your DNS host said:')}
          </p>
          <ul className="list-disc space-y-1 pl-5">
            {failure.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="text-muted-foreground">
            {t(
              'dnsWizard.failedHelp',
              'Check that the credential can edit this zone, then fix it on the DNS provider’s page. The server retries on its own.',
            )}
          </p>
        </div>
      )}
      <RecordTable records={records} states={states} />
      {records.some((r) => states.get(r) === 'different') && (
        <p className="text-xs text-muted-foreground">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5 text-highlight" />
          {t(
            'dnsWizard.differentHelp',
            'An amber mark means that name has a different value right now, often an old record that hasn’t expired from caches yet.',
          )}
        </p>
      )}
    </WizardShell>
  );
}
