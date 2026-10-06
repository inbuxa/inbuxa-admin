/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: guided setup, "How this server sends mail" (settings-reorg, first
 * wave). Direct delivery or a relay service: it checks whether port 25 is
 * open, fills in the relay's details from a preset, shows exactly what will
 * change, writes it, and says how to test it. Reached only by choosing
 * "Guide me"; the manual path is the Delivery strategy and Routes pages.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, CircleHelp, Loader2, Network, Send, ShieldCheck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { WizardNote, WizardShell, type WizardStep } from '@/components/wizard/WizardShell';
import { getAccountId, jmapRequest, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { cn } from '@/lib/utils';
import { currentMode, otherRules, plan, type Choice, type Current, type Expr, type RouteInfo } from './plan';
import { presetForHost, RELAY_PRESETS, type RelayPreset } from './providers';
import { usePort25Check } from './usePort25Check';

type Path = 'direct' | 'relay';

function setFailure(res: JmapSetResponse | undefined, kind: 'notCreated' | 'notUpdated'): string | null {
  const bad = res?.[kind];
  if (!bad) return null;
  const e = Object.values(bad)[0];
  if (!e) return null;
  const details = (e.validationErrors ?? []).map((v) => JSON.stringify(v)).join('; ');
  return [e.description, details].filter(Boolean).join(' ') || e.type;
}

async function load(): Promise<Current> {
  const call = (obj: string, args: Record<string, unknown>, id: string) =>
    [`${obj}/get`, { accountId: getAccountId(obj), ...args }, id] as [string, Record<string, unknown>, string];
  const res = await jmapRequest([
    call('x:MtaOutboundStrategy', { ids: ['singleton'], properties: ['route', 'tls'] }, 's'),
    call('x:MtaRoute', { ids: null }, 'r'),
    call('x:MtaTlsStrategy', { ids: null, properties: ['name'] }, 't'),
  ]);
  const byId = Object.fromEntries(res.map(([, body, id]) => [id, body as Record<string, unknown>]));
  const strategy = (byId.s?.list as Record<string, unknown>[] | undefined)?.[0];
  if (!strategy) throw new Error('The outbound delivery settings could not be read.');
  const expr = (v: unknown): Expr => {
    const e = (v ?? {}) as Partial<Expr>;
    return { match: e.match ?? {}, else: e.else ?? '' };
  };
  const routes = ((byId.r?.list as Record<string, unknown>[] | undefined) ?? []).map((r): RouteInfo => ({
    id: String(r.id),
    name: String(r.name ?? ''),
    type: String(r['@type'] ?? ''),
    address: r.address as string | undefined,
    port: r.port as number | undefined,
    implicitTls: r.implicitTls as boolean | undefined,
    authUsername: r.authUsername as string | null | undefined,
  }));
  const tlsStrategies = ((byId.t?.list as Record<string, unknown>[] | undefined) ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ''),
  }));
  return { route: expr(strategy.route), tls: expr(strategy.tls), routes, tlsStrategies };
}

function OptionCard({
  selected,
  onClick,
  icon: Icon,
  title,
  children,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  icon: typeof Send;
  title: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        'flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-colors hover:border-primary/60',
        selected ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-card',
      )}
    >
      <span className="flex w-full items-center gap-2 font-medium">
        <Icon className="h-4 w-4 text-primary" />
        {title}
        {badge && <span className="ml-auto">{badge}</span>}
      </span>
      <span className="text-sm text-muted-foreground">{children}</span>
    </button>
  );
}

export function SendingSetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const section = useSchemaStore((s) => s.viewToSection['x:MtaOutboundStrategy']) ?? 'Settings';
  const canProbe = useAccountStore((s) => s.hasPermission('liveDeliveryTest'));
  const port25 = usePort25Check();

  const [current, setCurrent] = useState<Current | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [path, setPath] = useState<Path | null>(null);
  const [step, setStep] = useState(0);
  const [preset, setPreset] = useState<RelayPreset>(RELAY_PRESETS[0]);
  const [host, setHost] = useState(RELAY_PRESETS[0].host);
  const [port, setPort] = useState(String(RELAY_PRESETS[0].port));
  const [implicitTls, setImplicitTls] = useState(RELAY_PRESETS[0].implicitTls);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [probeTarget, setProbeTarget] = useState('gmail.com');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    load()
      .then((cur) => {
        if (!live) return;
        setCurrent(cur);
        const mode = currentMode(cur);
        if (mode.kind === 'relay') {
          // Start from the relay already saved, so running the guide again edits it.
          const p = presetForHost(mode.route.address ?? '');
          setPreset(p);
          setHost(mode.route.address ?? '');
          setPort(String(mode.route.port ?? p.port));
          setImplicitTls(mode.route.implicitTls ?? p.implicitTls);
          setUsername(mode.route.authUsername ?? '');
        }
      })
      .catch((e: unknown) => live && setLoadError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, []);

  const mode = current ? currentMode(current) : null;
  const savedRelay = mode?.kind === 'relay' ? mode.route : undefined;

  const steps: WizardStep[] = useMemo(
    () =>
      path === 'relay'
        ? [
            { id: 'how', title: t('sendingSetup.stepHow', 'How mail leaves') },
            { id: 'service', title: t('sendingSetup.stepService', 'Relay service') },
            { id: 'signin', title: t('sendingSetup.stepSignIn', 'Sign-in') },
            { id: 'review', title: t('sendingSetup.stepReview', 'Review') },
            { id: 'done', title: t('sendingSetup.stepDone', 'Test it') },
          ]
        : [
            { id: 'how', title: t('sendingSetup.stepHow', 'How mail leaves') },
            { id: 'review', title: t('sendingSetup.stepReview', 'Review') },
            { id: 'done', title: t('sendingSetup.stepDone', 'Test it') },
          ],
    [path, t],
  );
  const stepId = steps[step]?.id ?? 'how';

  const choice: Choice | null = useMemo(() => {
    if (path === 'direct') return { kind: 'direct' };
    if (path !== 'relay') return null;
    return {
      kind: 'relay',
      host,
      port: Number(port),
      implicitTls,
      username: preset.username ?? username,
      password,
    };
  }, [path, host, port, implicitTls, preset, username, password]);

  const planned = useMemo(() => {
    if (!current || !choice) return null;
    try {
      return { plan: plan(current, choice), error: null };
    } catch (e) {
      return { plan: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [current, choice]);

  const pickPreset = (p: RelayPreset) => {
    setPreset(p);
    setHost(
      savedRelay && presetForHost(savedRelay.address ?? '').id === p.id ? (savedRelay.address ?? p.host) : p.host,
    );
    setPort(String(p.port));
    setImplicitTls(p.implicitTls);
    if (p.username) setUsername(p.username);
  };

  const apply = async () => {
    if (!planned?.plan) return;
    const p = planned.plan;
    setBusy(true);
    setError(null);
    const undo: (() => Promise<unknown>)[] = [];
    try {
      if (p.tlsCreate) {
        const [res] = await jmapSet('x:MtaTlsStrategy', getAccountId('x:MtaTlsStrategy'), {
          create: { tls: p.tlsCreate },
        });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const id = (body?.created?.tls as { id?: string } | undefined)?.id;
        if (!id) throw new Error(setFailure(body, 'notCreated') ?? 'The TLS strategy could not be added.');
        undo.push(() => jmapSet('x:MtaTlsStrategy', getAccountId('x:MtaTlsStrategy'), { destroy: [id] }));
      }
      if (p.routeCreate) {
        const [res] = await jmapSet('x:MtaRoute', getAccountId('x:MtaRoute'), { create: { route: p.routeCreate } });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const id = (body?.created?.route as { id?: string } | undefined)?.id;
        if (!id) throw new Error(setFailure(body, 'notCreated') ?? 'The relay route could not be added.');
        undo.push(() => jmapSet('x:MtaRoute', getAccountId('x:MtaRoute'), { destroy: [id] }));
      }
      if (p.routeUpdate) {
        const { id, patch } = p.routeUpdate;
        const before = current!.routes.find((r) => r.id === id)!;
        const [res] = await jmapSet('x:MtaRoute', getAccountId('x:MtaRoute'), { update: { [id]: patch } });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const failed = setFailure(body, 'notUpdated');
        if (failed || !body?.updated || !(id in body.updated))
          throw new Error(failed ?? 'The relay could not be saved.');
        undo.push(() =>
          jmapSet('x:MtaRoute', getAccountId('x:MtaRoute'), {
            update: {
              [id]: {
                address: before.address,
                port: before.port,
                implicitTls: before.implicitTls,
                authUsername: before.authUsername ?? null,
              },
            },
          }),
        );
      }
      if (p.strategy) {
        const [res] = await jmapSet('x:MtaOutboundStrategy', getAccountId('x:MtaOutboundStrategy'), {
          update: { singleton: p.strategy },
        });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const failed = setFailure(body, 'notUpdated');
        if (failed || !body?.updated || !('singleton' in body.updated)) {
          throw new Error(failed ?? 'The delivery strategy could not be changed.');
        }
      }
      setPassword('');
      setStep(steps.length - 1);
    } catch (e) {
      // Failsafe: what this run added or changed is put back, newest first.
      for (const u of undo.reverse()) await u().catch(() => undefined);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (loadError) return <div className="mx-auto max-w-3xl p-8 text-center text-destructive">{loadError}</div>;
  if (!current || !mode) return <LoadingFallback />;

  const common = {
    icon: 'send',
    title: t('sendingSetup.title', 'How this server sends mail'),
    subtitle: t(
      'sendingSetup.subtitle',
      'Deliver straight to other mail servers, or hand outgoing mail to a relay service that delivers it for you.',
    ),
    steps,
    current: step,
    onCancel: () => navigate(`/${section}/x:MtaOutboundStrategy`),
  };
  const others = otherRules(current);

  // ── Step: how mail leaves ──
  if (stepId === 'how') {
    const s = port25.state;
    const suggestRelay = s.kind === 'blocked';
    return (
      <WizardShell
        {...common}
        canNext={path !== null}
        onNext={() => setStep(1)}
        aside={
          <>
            <WizardNote title={t('sendingSetup.whyTitle', 'Which one?')}>
              <p>
                {t(
                  'sendingSetup.whyDirect',
                  'Direct delivery needs port 25 open to the internet, an IP address with a clean reputation, and reverse DNS that names this server.',
                )}
              </p>
              <p>
                {t(
                  'sendingSetup.whyRelay',
                  'A relay suits a home connection or a cloud host that blocks port 25, or when you’d rather someone else handle reputation. It costs a little and the service sees your outgoing mail.',
                )}
              </p>
            </WizardNote>
            <WizardNote tone="undo" title={t('sendingSetup.undoTitle', 'Changing your mind')}>
              <p>
                {t(
                  'sendingSetup.undo',
                  'Run this guide again and pick the other way. A relay you set up stays saved, unused, so switching back is quick.',
                )}
              </p>
            </WizardNote>
          </>
        }
      >
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">
            {mode.kind === 'direct' && t('sendingSetup.nowDirect', 'Right now this server delivers directly.')}
            {mode.kind === 'relay' &&
              t('sendingSetup.nowRelay', 'Right now outgoing mail goes through a relay: {{host}}.', {
                host: mode.route.address ?? mode.route.name,
              })}
            {mode.kind === 'other' &&
              t(
                'sendingSetup.nowOther',
                'Right now outgoing mail follows a custom rule ({{target}}). Choosing here replaces that fallback.',
                { target: mode.target },
              )}
          </p>
        </div>

        {canProbe && (
          <div className="space-y-3 rounded-xl border p-4">
            <div className="flex items-start gap-3">
              <Network className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p className="font-medium">{t('sendingSetup.checkTitle', 'Check port 25 first')}</p>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'sendingSetup.checkHint',
                    'Connects from this server to a big mail provider’s servers on port 25 and waits for their greeting. Nothing is sent.',
                  )}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={probeTarget}
                onChange={(e) => setProbeTarget(e.target.value)}
                className="max-w-48"
                aria-label={t('sendingSetup.checkTarget', 'Domain to try')}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void port25.run(probeTarget.trim() || 'gmail.com')}
                disabled={s.kind === 'running'}
              >
                {s.kind === 'running' && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('sendingSetup.checkRun', 'Check')}
              </Button>
            </div>
            {s.kind === 'open' && (
              <p className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                {t('sendingSetup.checkOpen', 'Port 25 is open: {{host}} answered. Direct delivery can work.', {
                  host: s.host,
                })}
              </p>
            )}
            {s.kind === 'blocked' && (
              <p className="flex items-start gap-2 text-sm">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                {t(
                  'sendingSetup.checkBlocked',
                  'Port 25 looks blocked ({{reason}}). Your host probably filters it: use a relay, or ask them to open it.',
                  { reason: s.reason.replace(/\.$/, '') },
                )}
              </p>
            )}
            {s.kind === 'unknown' && (
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                <CircleHelp className="mt-0.5 h-4 w-4 shrink-0" />
                {t('sendingSetup.checkUnknown', 'The check couldn’t tell: {{reason}}', { reason: s.reason })}
              </p>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <OptionCard
            selected={path === 'direct'}
            onClick={() => setPath('direct')}
            icon={Send}
            title={t('sendingSetup.direct', 'Deliver directly')}
            badge={
              s.kind === 'open' ? (
                <span className="text-xs text-emerald-600">{t('sendingSetup.recommended', 'Recommended')}</span>
              ) : undefined
            }
          >
            {t(
              'sendingSetup.directHint',
              'This server looks up each recipient’s mail servers and delivers to them itself. No third party, nothing to pay.',
            )}
          </OptionCard>
          <OptionCard
            selected={path === 'relay'}
            onClick={() => setPath('relay')}
            icon={ShieldCheck}
            title={t('sendingSetup.relay', 'Through a relay service')}
            badge={
              suggestRelay ? (
                <span className="text-xs text-emerald-600">{t('sendingSetup.recommended', 'Recommended')}</span>
              ) : undefined
            }
          >
            {t(
              'sendingSetup.relayHint',
              'Amazon SES, Mailgun, SendGrid, Postmark, Brevo, SMTP2GO or your ISP’s server. It delivers for you and handles reputation.',
            )}
          </OptionCard>
        </div>
      </WizardShell>
    );
  }

  // ── Step: which relay ──
  if (stepId === 'service') {
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
        canNext={host.trim() !== '' && Number(port) > 0}
        aside={
          <WizardNote title={t('sendingSetup.beforeTitle', 'Before this works')}>
            <p>{preset.before}</p>
          </WizardNote>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {RELAY_PRESETS.map((p) => (
            <OptionCard
              key={p.id}
              selected={preset.id === p.id}
              onClick={() => pickPreset(p)}
              icon={Send}
              title={p.name}
            >
              {p.id === 'other'
                ? t('sendingSetup.otherHint', 'Your ISP’s or provider’s outgoing server.')
                : p.regions
                  ? t('sendingSetup.byRegion', 'Server by region · port {{port}}', { port: p.port })
                  : `${p.host} · ${p.port}`}
            </OptionCard>
          ))}
        </div>

        {preset.regions && (
          <div className="space-y-1.5">
            <Label>{t('sendingSetup.region', 'Region')}</Label>
            <Select
              value={preset.regions.find((r) => r.host === host)?.id}
              onValueChange={(id) => setHost(preset.regions!.find((r) => r.id === id)!.host)}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {preset.regions.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('sendingSetup.regionHint', 'The region your account sends from.')}
            </p>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="space-y-1.5">
            <Label htmlFor="relay-host">{t('sendingSetup.host', 'Server')}</Label>
            <Input
              id="relay-host"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="smtp.example.net"
              spellCheck={false}
              readOnly={Boolean(preset.regions)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="relay-port">{t('sendingSetup.port', 'Port')}</Label>
            <Input
              id="relay-port"
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => {
                setPort(e.target.value);
                if (e.target.value === '465') setImplicitTls(true);
                else if (e.target.value === '587' || e.target.value === '25' || e.target.value === '2525')
                  setImplicitTls(false);
              }}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>{t('sendingSetup.encryption', 'Encryption')}</Label>
          <Select value={implicitTls ? 'implicit' : 'starttls'} onValueChange={(v) => setImplicitTls(v === 'implicit')}>
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="implicit">
                {t('sendingSetup.implicit', 'Encrypted from the start (usually port 465)')}
              </SelectItem>
              <SelectItem value="starttls">
                {t('sendingSetup.starttls', 'STARTTLS, required (usually port 587)')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </WizardShell>
    );
  }

  // ── Step: sign-in ──
  if (stepId === 'signin') {
    const needsPassword = (preset.username ?? username).trim() !== '' && !savedRelay && password === '';
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(1)}
        onNext={() => setStep(3)}
        canNext={!needsPassword}
        aside={
          <WizardNote title={t('sendingSetup.storedTitle', 'Where it’s kept')}>
            <p>
              {t(
                'sendingSetup.stored',
                'The password is saved in this server’s settings, like other secrets, and is never shown again here.',
              )}
            </p>
          </WizardNote>
        }
      >
        <div className="space-y-1.5">
          <Label htmlFor="relay-user">{t('sendingSetup.username', 'User name')}</Label>
          <Input
            id="relay-user"
            value={preset.username ?? username}
            onChange={(e) => setUsername(e.target.value)}
            readOnly={Boolean(preset.username)}
            autoComplete="off"
            spellCheck={false}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">{preset.usernameHint}</p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="relay-pass">{t('sendingSetup.password', 'Password')}</Label>
          <Input
            id="relay-pass"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={savedRelay ? t('sendingSetup.keepPassword', 'Leave empty to keep the saved one') : undefined}
            className="max-w-md"
          />
          <p className="text-xs text-muted-foreground">{preset.passwordHint}</p>
        </div>
      </WizardShell>
    );
  }

  // ── Step: review ──
  if (stepId === 'review') {
    const p = planned?.plan;
    const nothing = p && p.changes.length === 0;
    return (
      <WizardShell
        {...common}
        onBack={() => setStep(step - 1)}
        onNext={nothing ? () => setStep(steps.length - 1) : () => void apply()}
        nextLabel={nothing ? t('wizard.next', 'Next') : t('sendingSetup.apply', 'Make the change')}
        canNext={Boolean(p)}
        busy={busy}
        aside={
          <WizardNote tone="undo" title={t('sendingSetup.ifFails', 'If something fails')}>
            <p>
              {t(
                'sendingSetup.rollback',
                'The changes are written one at a time. If one is refused, the ones before it are put back, so a failed attempt leaves things as they were.',
              )}
            </p>
          </WizardNote>
        }
      >
        {planned?.error && (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {planned.error}
          </p>
        )}
        {nothing && (
          <p className="text-sm">
            {t('sendingSetup.nothing', 'This server already sends mail this way. Nothing needs to change.')}
          </p>
        )}
        {p && p.changes.length > 0 && (
          <div className="space-y-2">
            <p className="font-medium">{t('sendingSetup.willChange', 'What will change')}</p>
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {p.changes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        )}
        {others.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="font-medium">{t('sendingSetup.kept', 'Left as they are')}</p>
            <p className="text-muted-foreground">
              {t(
                'sendingSetup.keptHint',
                'Your {{count}} other routing rules still apply first, before this fallback.',
                { count: others.length },
              )}
            </p>
          </div>
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

  // ── Step: test it ──
  const management = useSchemaStore.getState().viewToSection['x:QueuedMessage'] ?? 'Management';
  return (
    <WizardShell
      {...common}
      onNext={() => navigate(`/${section}/x:MtaOutboundStrategy`)}
      nextLabel={t('wizard.finish', 'Finish')}
      aside={
        <WizardNote title={t('sendingSetup.whereTitle', 'Where to look later')}>
          <p>
            {t(
              'sendingSetup.where',
              'Settings › Mail flow › Sending holds the delivery strategy and routes this guide changed, for anything it doesn’t cover.',
            )}
          </p>
        </WizardNote>
      }
    >
      <p className="flex items-center gap-2 font-medium">
        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
        {path === 'relay'
          ? t('sendingSetup.doneRelay', 'Outgoing mail now goes through {{host}}.', { host: host.trim() })
          : t('sendingSetup.doneDirect', 'This server delivers outgoing mail directly.')}
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-sm">
        <li>
          {t(
            'sendingSetup.test1',
            'From the webmail, send a message to an address outside your domains, such as a personal Gmail or Outlook account.',
          )}
        </li>
        <li>
          {t('sendingSetup.test2', 'Watch it leave in')}{' '}
          <Link
            className="text-primary underline-offset-4 hover:underline"
            to={`/${management}/x:Trace/OutboundDelivery`}
          >
            {t('sendingSetup.test2Link', 'Emails › History › Outbound delivery')}
          </Link>
          {t('sendingSetup.test2b', '. A delivery lists each attempt and the answer from the other side.')}
        </li>
        <li>
          {t('sendingSetup.test3', 'If it waits in')}{' '}
          <Link className="text-primary underline-offset-4 hover:underline" to={`/${management}/x:QueuedMessage`}>
            {t('sendingSetup.test3Link', 'Emails › Queued')}
          </Link>
          {path === 'relay'
            ? t(
                'sendingSetup.test3Relay',
                ', its last error says why: usually the sign-in, or a sender domain the relay hasn’t verified yet.',
              )
            : t(
                'sendingSetup.test3Direct',
                ', its last error says why: often port 25 being blocked, or the other side rejecting this server’s IP.',
              )}
        </li>
      </ol>
    </WizardShell>
  );
}
