/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › System › Server count. The opt-in "count this server"
 * switch, off by default, with the exact body the server would send shown
 * beside it, when it last checked in, and where the collector's code lives.
 * Advanced holds the collector's address, for forks and private builds.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ExternalLink, Loader2, Server } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { PolicyUnavailable } from '@/features/hardening/protocolPolicy';
import { toast } from '@/hooks/use-toast';
import { useAccountStore } from '@/stores/accountStore';
import {
  COUNT_DOCS_URL,
  COUNT_SOURCE_URL,
  fetchCountSettings,
  updateCountSettings,
  type CountSettings,
} from './countSettings';
import { CountExplanation } from './CountExplanation';

type Load = { kind: 'loading' } | { kind: 'ready'; value: CountSettings } | { kind: 'error'; message: string | null };

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** "YYYY-MM-DD" as a date in the reader's language; the day itself, not shifted by time zone. */
function formatDay(day: string, language: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return day;
  return date.toLocaleDateString(language, { dateStyle: 'long', timeZone: 'UTC' });
}

export function ServerCountPage() {
  const { t, i18n } = useTranslation();
  const canGet = useAccountStore((s) => s.hasPermission('sysTracerGet'));
  const canUpdate = useAccountStore((s) => s.hasPermission('sysTracerUpdate'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [endpoint, setEndpoint] = useState('');
  const [endpointError, setEndpointError] = useState<string | null>(null);
  const [savingEndpoint, setSavingEndpoint] = useState(false);

  const reload = useCallback(
    (signal?: AbortSignal) =>
      fetchCountSettings(signal).then(
        (value) => {
          if (signal?.aborted) return;
          setLoad({ kind: 'ready', value });
          setEndpoint(value.endpoint);
        },
        (e: unknown) => {
          if (signal?.aborted) return;
          setLoad({ kind: 'error', message: e instanceof PolicyUnavailable ? null : errorText(e) });
        },
      ),
    [],
  );

  useEffect(() => {
    if (!canGet) return;
    const ctl = new AbortController();
    void reload(ctl.signal);
    return () => ctl.abort();
  }, [canGet, reload]);

  if (canGet && load.kind === 'loading') return <LoadingFallback />;

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      // Choosing here answers the question on the overview too.
      await updateCountSettings({ enabled, decided: true });
      // A fresh ID, and so a fresh preview, comes with turning it on.
      await reload();
    } catch (e) {
      toast({ variant: 'destructive', title: t('serverCount.failed', 'Not saved'), description: errorText(e) });
    } finally {
      setBusy(false);
    }
  };

  const saveEndpoint = async () => {
    setSavingEndpoint(true);
    setEndpointError(null);
    try {
      await updateCountSettings({ endpoint: endpoint.trim() });
      await reload();
      toast({ title: t('serverCount.endpointSaved', 'Collector address saved.') });
    } catch (e) {
      // The server's own reason, such as an address that isn't https.
      setEndpointError(errorText(e));
    } finally {
      setSavingEndpoint(false);
    }
  };

  const settings = load.kind === 'ready' ? load.value : null;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-2">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Server className="h-6 w-6" /> {t('serverCount.title', 'Help count inbuxa servers')}
        </h1>
        <CountExplanation />
      </header>

      {!canGet ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t('serverCount.noAccess', 'Your account may not read this setting.')}
          </CardContent>
        </Card>
      ) : load.kind === 'error' ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {load.message === null
              ? t('serverCount.unavailable', 'This server has no count setting, so it sends nothing.')
              : load.message}
          </CardContent>
        </Card>
      ) : (
        settings && (
          <>
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <Label htmlFor="server-count-switch" className="text-base font-medium">
                      {t('serverCount.switch', 'Count this server')}
                    </Label>
                    <p className="text-sm text-muted-foreground" data-testid="server-count-status">
                      {!settings.enabled
                        ? t('serverCount.statusOff', 'Off. This server sends nothing.')
                        : settings.lastCheckIn
                          ? t('serverCount.statusLast', 'On. Last checked in on {{date}}.', {
                              date: formatDay(settings.lastCheckIn, i18n.language),
                            })
                          : t('serverCount.statusNotYet', 'On. Not checked in yet.')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                    <Switch
                      id="server-count-switch"
                      checked={settings.enabled}
                      disabled={!canUpdate || busy}
                      onCheckedChange={(on) => void toggle(on)}
                    />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'serverCount.details',
                    'Turning it on makes a new random ID. In a cluster, only one node sends. While it is off, this server makes no request for the count at all.',
                  )}
                </p>
              </CardContent>
            </Card>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                {t('serverCount.whatIsSent', 'Exactly what is sent')}
              </h2>
              <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 text-sm">
                <code data-testid="server-count-preview">
                  {settings.preview || t('serverCount.noPreview', 'The server did not say.')}
                </code>
              </pre>
              <p className="text-sm text-muted-foreground">
                {t(
                  'serverCount.whatIsSentNote',
                  'This is the whole request body, once a week, while the switch is on.',
                )}
              </p>
            </section>

            <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              <a
                href={COUNT_DOCS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4"
              >
                {t('serverCount.docsLink', 'How the count works')}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={COUNT_SOURCE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4"
              >
                {t('serverCount.sourceLink', 'Collector source')}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>

            <Collapsible>
              <CollapsibleTrigger className="group inline-flex items-center gap-1 text-sm font-medium">
                <ChevronRight className="h-4 w-4 transition-transform group-data-[state=open]:rotate-90" />
                {t('serverCount.advanced', 'Advanced')}
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3 space-y-3 rounded-xl border p-4">
                <p className="text-sm text-muted-foreground">
                  {t(
                    'serverCount.endpointHelp',
                    'Where the weekly request goes. Forks and private builds can point this at their own collector. It must be an https:// address.',
                  )}
                </p>
                <form
                  className="flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void saveEndpoint();
                  }}
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor="server-count-endpoint">{t('serverCount.endpoint', 'Collector address')}</Label>
                    <Input
                      id="server-count-endpoint"
                      type="url"
                      value={endpoint}
                      disabled={!canUpdate || savingEndpoint}
                      onChange={(e) => {
                        setEndpoint(e.target.value);
                        setEndpointError(null);
                      }}
                      aria-invalid={endpointError !== null}
                    />
                  </div>
                  {canUpdate && (
                    <Button
                      type="submit"
                      size="sm"
                      disabled={savingEndpoint || endpoint.trim() === '' || endpoint.trim() === settings.endpoint}
                    >
                      {savingEndpoint && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {t('serverCount.save', 'Save')}
                    </Button>
                  )}
                </form>
                {endpointError && (
                  <p className="text-sm text-destructive" role="alert">
                    {endpointError}
                  </p>
                )}
              </CollapsibleContent>
            </Collapsible>
          </>
        )
      )}
    </div>
  );
}
