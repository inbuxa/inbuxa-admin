/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Monitoring › Metrics, where the server's numbers go
 * (settings-reorg, second wave): Prometheus scraping, with the address and
 * a scrape job to paste, and pushing to an OpenTelemetry endpoint, with
 * Honeycomb, Grafana Cloud or your own collector filled in.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Loader2, Radio } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getApiBaseUrl } from '@/services/api';
import { getAccountId, jmapGet, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import type { JmapSetResponse } from '@/types/jmap';
import { toast } from '@/hooks/use-toast';
import {
  newPassword,
  otelValue,
  providerOf,
  scrapeConfig,
  scrapeUrl,
  type OtelInput,
  type OtelProvider,
} from './connect';

const OBJECT = 'x:Metrics';

function CopyBlock({ text }: { text: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">{text}</pre>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="absolute right-1 top-1 h-7 gap-1 px-2 text-xs"
        onClick={() =>
          void navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied ? t('metricsConnect.copied', 'Copied') : t('metricsConnect.copy', 'Copy')}
      </Button>
    </div>
  );
}

export function MetricsConnect({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysMetrics', 'Update'));
  const base = getApiBaseUrl() || window.location.origin;
  const [loaded, setLoaded] = useState(false);
  const [promOn, setPromOn] = useState(false);
  const [promUser, setPromUser] = useState('prometheus');
  const [promPassword, setPromPassword] = useState<string | null>(null);
  // The new password stays on screen for copying after it's saved.
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [promSaved, setPromSaved] = useState<{ on: boolean; user: string } | null>(null);
  const [provider, setProvider] = useState<OtelProvider>('off');
  const [savedProvider, setSavedProvider] = useState<OtelProvider>('off');
  const [otel, setOtel] = useState<OtelInput>({ endpoint: '', key: '', extra: '' });
  const [otelDirty, setOtelDirty] = useState(false);
  // Honeycomb's key travels as a plain header the server returns, so an empty field can keep it.
  const [savedHcKey, setSavedHcKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    jmapGet(OBJECT, getAccountId(OBJECT), ['singleton'], ['prometheus', 'openTelemetry'])
      .then(([res]) => {
        const data = ((res?.[1] as { list?: Record<string, unknown>[] })?.list ?? [])[0] ?? {};
        if (!live) return;
        const prom = (data.prometheus ?? {}) as Record<string, unknown>;
        const on = prom['@type'] === 'Enabled';
        const user = (prom.authUsername as string | null) ?? '';
        setPromOn(on);
        if (on) setPromUser(user);
        setPromSaved({ on, user });
        const o = (data.openTelemetry ?? {}) as Record<string, unknown>;
        const p = providerOf(o);
        setProvider(p);
        setSavedProvider(p);
        const headers = (o.httpHeaders ?? {}) as Record<string, string>;
        const auth = (o.httpAuth ?? {}) as Record<string, unknown>;
        setSavedHcKey(p === 'honeycomb' ? (headers['x-honeycomb-team'] ?? '') : '');
        setOtel({
          endpoint: String(o.endpoint ?? ''),
          key: '',
          extra: p === 'honeycomb' ? (headers['x-honeycomb-dataset'] ?? '') : String(auth.username ?? ''),
        });
        setLoaded(true);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!loaded || !promSaved) return null;

  const newPasswordPending = promPassword !== null && !passwordSaved;
  const promChanged = promOn !== promSaved.on || (promOn && (promUser !== promSaved.user || newPasswordPending));
  const otelChanged = provider !== savedProvider || otelDirty;
  // Grafana's token is a secret the server never hands back, so any change there asks for it again.
  const needsKey =
    (provider === 'honeycomb' && !(savedProvider === 'honeycomb' && savedHcKey)) ||
    (provider === 'grafana' && (provider !== savedProvider || otelDirty));
  const otelValid =
    provider === 'off' ||
    ((provider === 'honeycomb' || /^https?:\/\//.test(otel.endpoint.trim())) && (!needsKey || otel.key.trim() !== ''));
  const promValid = !promOn || promUser.trim() === '' || promSaved.user === promUser.trim() || newPasswordPending;

  const save = async () => {
    setBusy(true);
    try {
      const patch: Record<string, unknown> = {};
      if (promChanged) {
        patch.prometheus = promOn
          ? {
              '@type': 'Enabled',
              authUsername: promUser.trim() || null,
              ...(promUser.trim() === ''
                ? { authSecret: { '@type': 'None' } }
                : newPasswordPending
                  ? { authSecret: { '@type': 'Value', secret: promPassword } }
                  : {}),
            }
          : { '@type': 'Disabled' };
      }
      if (otelChanged) {
        const key = provider === 'honeycomb' && !otel.key.trim() ? savedHcKey : otel.key;
        patch.openTelemetry = otelValue(provider, { ...otel, key });
      }
      const [res] = await jmapSet(OBJECT, getAccountId(OBJECT), { update: { singleton: patch } });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const bad = body?.notUpdated?.singleton;
      if (bad) throw new Error(bad.description ?? bad.type);
      setPromSaved({ on: promOn, user: promUser.trim() });
      if (promPassword !== null) setPasswordSaved(true);
      setSavedProvider(provider);
      setOtelDirty(false);
      onSaved?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('metricsConnect.failed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const tryScrape = async () => {
    setCheck(t('metricsConnect.checking', 'Checking…'));
    try {
      const headers: Record<string, string> = {};
      if (promUser && promPassword) headers.Authorization = `Basic ${btoa(`${promUser}:${promPassword}`)}`;
      const res = await fetch(scrapeUrl(base), { headers, cache: 'no-store' });
      if (res.status === 401) {
        setCheck(t('metricsConnect.needsLogin', 'It answers, and asks for the user name and password: as it should.'));
      } else if (res.ok) {
        const text = await res.text();
        const lines = text.split('\n').filter((l) => l && !l.startsWith('#')).length;
        setCheck(t('metricsConnect.works', 'It answers with {{count}} measurements.', { count: lines }));
      } else {
        setCheck(t('metricsConnect.status', 'It answered {{status}}.', { status: res.status }));
      }
    } catch {
      setCheck(
        t(
          'metricsConnect.cantCheck',
          'The browser couldn’t read it (usually cross-site rules). Check the target on your Prometheus instead.',
        ),
      );
    }
  };

  const field = (key: keyof OtelInput, label: string, placeholder: string, hint?: string, secret = false) => (
    <div className="space-y-1.5">
      <Label htmlFor={`otel-${key}`}>{label}</Label>
      <Input
        id={`otel-${key}`}
        type={secret ? 'password' : 'text'}
        autoComplete={secret ? 'new-password' : 'off'}
        value={otel[key]}
        placeholder={placeholder}
        disabled={!canUpdate}
        onChange={(e) => {
          setOtel((o) => ({ ...o, [key]: e.target.value }));
          setOtelDirty(true);
        }}
        className="max-w-lg"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <Radio className="h-5 w-5 text-primary" />
        <p className="flex-1 font-medium">{t('metricsConnect.title', 'Where the server’s numbers go')}</p>
        {(promChanged || otelChanged) && (
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !otelValid || !promValid}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('metricsConnect.save', 'Save changes')}
          </Button>
        )}
      </div>

      <section className="space-y-3">
        <label className="flex items-start justify-between gap-4">
          <span>
            <span className="font-medium">{t('metricsConnect.prom', 'Let Prometheus collect them')}</span>
            <span className="block text-xs text-muted-foreground">
              {t('metricsConnect.promHint', 'Prometheus fetches them from this server every so often.')}
            </span>
          </span>
          <Switch checked={promOn} disabled={!canUpdate} onCheckedChange={setPromOn} />
        </label>
        {promOn && (
          <div className="space-y-3 border-l-2 pl-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="prom-user">{t('metricsConnect.user', 'User name')}</Label>
                <Input
                  id="prom-user"
                  value={promUser}
                  disabled={!canUpdate}
                  onChange={(e) => setPromUser(e.target.value)}
                  className="w-48"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!canUpdate || !promUser.trim()}
                onClick={() => {
                  setPromPassword(newPassword());
                  setPasswordSaved(false);
                }}
              >
                {promPassword
                  ? t('metricsConnect.newPassword', 'Make another password')
                  : promSaved.on && promSaved.user
                    ? t('metricsConnect.replacePassword', 'Replace the password')
                    : t('metricsConnect.makePassword', 'Make a password')}
              </Button>
            </div>
            {!promUser.trim() && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t(
                  'metricsConnect.open',
                  'Without a user name anyone who can reach the server can read these numbers, which show how busy it is.',
                )}
              </p>
            )}
            {promPassword && (
              <p className="text-xs text-muted-foreground">
                {t(
                  'metricsConnect.shownOnce',
                  'The new password is in the scrape job below. It’s shown only now: copy it before you leave.',
                )}
              </p>
            )}
            <p className="text-sm">
              {t('metricsConnect.address', 'Address:')}{' '}
              <code className="rounded bg-muted px-1 text-xs">{scrapeUrl(base)}</code>
            </p>
            <CopyBlock text={scrapeConfig(base, promUser.trim(), promPassword)} />
            {!promChanged && promSaved.on && (
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" size="sm" variant="outline" onClick={() => void tryScrape()}>
                  {t('metricsConnect.check', 'Check it answers')}
                </Button>
                {check && <span className="text-xs text-muted-foreground">{check}</span>}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="space-y-3 border-t pt-4">
        <div className="space-y-1.5">
          <Label>{t('metricsConnect.otel', 'Send them to an OpenTelemetry service')}</Label>
          <Select
            value={provider}
            disabled={!canUpdate}
            onValueChange={(v) => {
              setProvider(v as OtelProvider);
              setOtelDirty(true);
            }}
          >
            <SelectTrigger className="max-w-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="off">{t('metricsConnect.off', 'Don’t send them')}</SelectItem>
              <SelectItem value="honeycomb">Honeycomb</SelectItem>
              <SelectItem value="grafana">Grafana Cloud</SelectItem>
              <SelectItem value="collectorHttp">
                {t('metricsConnect.collectorHttp', 'Your own collector (HTTP)')}
              </SelectItem>
              <SelectItem value="collectorGrpc">
                {t('metricsConnect.collectorGrpc', 'Your own collector (gRPC)')}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        {provider === 'honeycomb' && (
          <>
            {field(
              'key',
              t('metricsConnect.hcKey', 'API key'),
              savedProvider === 'honeycomb' ? t('metricsConnect.keep', 'Leave empty to keep the saved one') : '',
              t('metricsConnect.hcKeyHint', 'An ingest key from your Honeycomb environment’s API keys.'),
              true,
            )}
            {field('extra', t('metricsConnect.hcDataset', 'Dataset'), 'inbuxa')}
          </>
        )}
        {provider === 'grafana' && (
          <>
            {field(
              'endpoint',
              t('metricsConnect.gcEndpoint', 'OTLP endpoint'),
              'https://otlp-gateway-prod-eu-west-2.grafana.net/otlp',
              t('metricsConnect.gcEndpointHint', 'From your stack’s OpenTelemetry page in the Grafana Cloud portal.'),
            )}
            {field('extra', t('metricsConnect.gcInstance', 'Instance ID'), '123456')}
            {field(
              'key',
              t('metricsConnect.gcToken', 'Token'),
              '',
              t(
                'metricsConnect.gcTokenHint',
                'An access policy token with metrics:write. Needed again whenever these settings change.',
              ),
              true,
            )}
            <p className="text-xs text-muted-foreground">
              {t(
                'metricsConnect.delta',
                'This server sends counters as deltas. If some counters don’t show up, put an OpenTelemetry Collector with the deltatocumulative processor in between.',
              )}
            </p>
          </>
        )}
        {provider === 'collectorHttp' &&
          field(
            'endpoint',
            t('metricsConnect.collectorUrl', 'Collector address'),
            'http://collector.internal:4318',
            t('metricsConnect.collectorHttpHint', '/v1/metrics is added if it isn’t there.'),
          )}
        {provider === 'collectorGrpc' &&
          field('endpoint', t('metricsConnect.collectorUrl', 'Collector address'), 'http://collector.internal:4317')}
        {provider !== 'off' && (
          <p className="text-xs text-muted-foreground">
            {t('metricsConnect.pushEvery', 'The server sends them once a minute.')}
          </p>
        )}
      </section>
    </div>
  );
}
