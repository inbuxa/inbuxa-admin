/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Mail flow › Sending › Encrypted senders (admin #187). See model.ts
 * for what this writes and why the rows go first.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, AtSign, Globe, Loader2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { getAccountId, jmapRequest, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { toast } from '@/hooks/use-toast';
import type { JmapSetResponse } from '@/types/jmap';
import {
  entries,
  otherSenderRules,
  parseEntry,
  planAdd,
  planCertificates,
  planRemove,
  planReorder,
  planRequire,
  rowsFirst,
  strategy,
  strategyWeakened,
  type Current,
  type Entry,
  type Expr,
  type Plan,
} from './model';

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
    call('x:MtaOutboundStrategy', { ids: ['singleton'], properties: ['tls'] }, 's'),
    call('x:MtaTlsStrategy', { ids: null, properties: ['name', 'allowInvalidCerts', 'startTls'] }, 't'),
  ]);
  const byId = Object.fromEntries(res.map(([, body, id]) => [id, body as Record<string, unknown>]));
  const outbound = (byId.s?.list as Record<string, unknown>[] | undefined)?.[0];
  if (!outbound) throw new Error('The outbound delivery settings could not be read.');
  const e = (outbound.tls ?? {}) as Partial<Expr>;
  const tlsStrategies = ((byId.t?.list as Record<string, unknown>[] | undefined) ?? []).map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ''),
    allowInvalidCerts: s.allowInvalidCerts as boolean | undefined,
    startTls: s.startTls as string | undefined,
  }));
  return { tls: { match: e.match ?? {}, else: e.else ?? '' }, tlsStrategies };
}

/** Applies a plan: the strategy first, then the rule. A failed rule change removes a strategy it just added. */
async function apply(p: Plan): Promise<void> {
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
    if (p.tlsUpdate) {
      const { id, patch } = p.tlsUpdate;
      const [res] = await jmapSet('x:MtaTlsStrategy', getAccountId('x:MtaTlsStrategy'), { update: { [id]: patch } });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const failed = setFailure(body, 'notUpdated');
      if (failed || !body?.updated || !(id in body.updated))
        throw new Error(failed ?? 'The TLS strategy could not be changed.');
    }
    if (p.tls) {
      const [res] = await jmapSet('x:MtaOutboundStrategy', getAccountId('x:MtaOutboundStrategy'), {
        update: { singleton: { tls: p.tls } },
      });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const failed = setFailure(body, 'notUpdated');
      if (failed || !body?.updated || !('singleton' in body.updated))
        throw new Error(failed ?? 'The delivery strategy could not be changed.');
    }
  } catch (e) {
    for (const u of undo.reverse()) await u().catch(() => undefined);
    throw e;
  }
}

function isEmpty(p: Plan): boolean {
  return !p.tls && !p.tlsCreate && !p.tlsUpdate;
}

export function EncryptedSendersPage() {
  const { t } = useTranslation();
  const section = useSchemaStore((s) => s.viewToSection['x:MtaOutboundStrategy']) ?? 'Settings';
  const canEditRule = useAccountStore((s) => s.hasPermission('sysMtaOutboundStrategyUpdate'));
  const canCreateStrategy = useAccountStore((s) => s.hasPermission('sysMtaTlsStrategyCreate'));
  const canUpdateStrategy = useAccountStore((s) => s.hasPermission('sysMtaTlsStrategyUpdate'));
  const [current, setCurrent] = useState<Current | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [fetches, setFetches] = useState(0);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    load()
      .then((c) => {
        if (!live) return;
        setCurrent(c);
        setLoadError(null);
      })
      .catch((e: unknown) => {
        if (live) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      live = false;
    };
  }, [fetches]);

  if (loadError) return <div className="mx-auto max-w-3xl p-8 text-center text-destructive">{loadError}</div>;
  if (!current) return <LoadingFallback />;

  const list = entries(current);
  const own = strategy(current);
  const canAdd = canEditRule && (!!own || canCreateStrategy);
  const typed = input.trim() ? parseEntry(input) : null;
  const duplicate = !!typed && list.some((e) => e.kind === typed.kind && e.value === typed.value);
  const others = otherSenderRules(current);
  const strategyLink = `/${section}/x:MtaOutboundStrategy`;

  // Success needs no toast of its own: every settings write ends in the
  // console's "Saved and applied" (or the banner saying why it wasn't).
  const run = async (key: string, p: Plan) => {
    if (isEmpty(p)) return;
    setBusy(key);
    try {
      await apply(p);
      refetch();
      return true;
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('encryptedSenders.failed', 'Nothing changed'),
        description: e instanceof Error ? e.message : String(e),
      });
      return false;
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    if (!typed || duplicate) return;
    const ok = await run('add', planAdd(current, typed));
    if (ok) setInput('');
  };

  const remove = (e: Entry) => run(`remove:${e.kind}:${e.value}`, planRemove(current, e));

  const label = (e: Entry) =>
    e.kind === 'address'
      ? t('encryptedSenders.kindAddress', 'This address')
      : t('encryptedSenders.kindDomain', 'Every address at this domain');

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon="shield-check"
        title={t('encryptedSenders.title', 'Encrypted senders')}
        subtitle={t(
          'encryptedSenders.subtitle',
          'Mail from these addresses and domains is only ever delivered over an encrypted connection. Everyone else keeps the normal behavior: encrypted when the other server offers it.',
        )}
      />

      {!rowsFirst(current) && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            {t(
              'encryptedSenders.notFirst',
              'Another condition in the delivery strategy’s TLS rule now comes before these senders. A retry after a TLS error could then be sent with a lenient strategy.',
            )}
          </div>
          {canEditRule && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run('reorder', planReorder(current))}
            >
              {busy === 'reorder' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('encryptedSenders.reorder', 'Put them first')}
            </Button>
          )}
        </div>
      )}

      {strategyWeakened(current) && (
        <div className="flex flex-wrap items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            {t(
              'encryptedSenders.weakened',
              'The TLS strategy these senders use no longer requires STARTTLS, so their mail can go out unencrypted.',
            )}
          </div>
          {canUpdateStrategy && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy !== null}
              onClick={() => run('require', planRequire(current))}
            >
              {busy === 'require' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('encryptedSenders.require', 'Require it')}
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3 rounded-xl border bg-card p-4">
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t('encryptedSenders.none', 'No sender is required to send encrypted.')}
          </p>
        ) : (
          <ul className="divide-y">
            {list.map((e) => {
              const key = `remove:${e.kind}:${e.value}`;
              const Icon = e.kind === 'address' ? AtSign : Globe;
              return (
                <li key={`${e.kind}:${e.value}`} className="flex items-center gap-3 py-2">
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{e.value}</div>
                    <div className="text-xs text-muted-foreground">{label(e)}</div>
                  </div>
                  {canEditRule && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('encryptedSenders.removeLabel', 'Remove {{value}}', { value: e.value })}
                      disabled={busy !== null}
                      onClick={() => remove(e)}
                    >
                      {busy === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {canAdd && (
          <form
            className="space-y-1.5 border-t pt-3"
            onSubmit={(ev) => {
              ev.preventDefault();
              void add();
            }}
          >
            <Label htmlFor="encrypted-sender">{t('encryptedSenders.addLabel', 'Address or domain')}</Label>
            <div className="flex gap-2">
              <Input
                id="encrypted-sender"
                value={input}
                autoComplete="off"
                spellCheck={false}
                placeholder="secure@example.org"
                onChange={(ev) => setInput(ev.target.value)}
              />
              <Button type="submit" disabled={!typed || duplicate || busy !== null}>
                {busy === 'add' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                {t('encryptedSenders.add', 'Add')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {input.trim() && !typed
                ? t('encryptedSenders.invalid', 'Type an address (name@example.org) or a domain (example.org).')
                : duplicate
                  ? t('encryptedSenders.duplicate', 'Already on the list.')
                  : t(
                      'encryptedSenders.addHint',
                      'A domain covers every address at it, aliases included. This is the envelope sender, which is the address mail is sent as.',
                    )}
            </p>
          </form>
        )}
      </div>

      <div className="space-y-3 rounded-xl border bg-card p-4 text-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label htmlFor="encrypted-certs" className="font-medium">
              {t('encryptedSenders.certsTitle', 'Check the other server’s certificate')}
            </Label>
            <p className="text-muted-foreground">
              {t(
                'encryptedSenders.certsHelp',
                'On: the connection must be encrypted and the certificate valid for that server. Off: any certificate is accepted, so mail still reaches servers with self-signed certificates, but someone in the middle could read it.',
              )}
            </p>
          </div>
          <Switch
            id="encrypted-certs"
            checked={!(own?.allowInvalidCerts ?? false)}
            disabled={busy !== null || !(own ? canUpdateStrategy : canCreateStrategy)}
            onCheckedChange={(on) => run('certs', planCertificates(current, !on))}
          />
        </div>
      </div>

      <div className="space-y-2 text-sm text-muted-foreground">
        <p>
          {t(
            'encryptedSenders.behavior',
            'If the other server doesn’t offer encryption at all, the message bounces right away. If it offers it but the encrypted connection fails, the message is retried, and bounces when the queue gives up. Either way nothing is sent unencrypted.',
          )}
        </p>
        <p>
          {t(
            'encryptedSenders.requireTls',
            'A mail client can also ask for this one message at a time, with REQUIRETLS. The server honors that for every sender.',
          )}
        </p>
        {others.length > 0 && (
          <p>
            {t(
              'encryptedSenders.others',
              'Other conditions in the TLS rule also look at the sender. This page leaves them as they are.',
            )}{' '}
            <Link className="underline underline-offset-2" to={strategyLink}>
              {t('encryptedSenders.openStrategy', 'Open the delivery strategy')}
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
