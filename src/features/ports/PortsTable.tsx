/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: above Network › Listeners, the standard mail ports as one table
 * (settings-reorg, second wave): what each is for, its encryption, whether
 * it's open, and a switch. IMAP, POP3 and ManageSieve (and the sending
 * ports when legacy mail is off) are switched on Hardening, so their rows
 * link there. Custom listeners stay in the list below.
 */

import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, Network } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAccountId, jmapGet, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { toast } from '@/hooks/use-toast';
import { fetchProtocolPolicy, type ProtocolPolicy } from '@/features/hardening/protocolPolicy';
import { cn } from '@/lib/utils';
import {
  classify,
  encryptionWords,
  listenerFor,
  portsOf,
  SERVICES,
  type ListenerRecord,
  type Service,
} from './services';

const OBJECT = 'x:NetworkListener';

export function PortsTable({ onChanged }: { onChanged?: () => void }) {
  const { t } = useTranslation();
  const canCreate = useAccountStore((s) => s.hasObjectPermission('sysNetworkListener', 'Create'));
  const canDestroy = useAccountStore((s) => s.hasObjectPermission('sysNetworkListener', 'Destroy'));
  const hardeningSection = useSchemaStore((s) => s.viewToSection['CustomComponent/LegacyProtocols']) ?? 'Settings';
  const [listeners, setListeners] = useState<ListenerRecord[] | null>(null);
  const [policy, setPolicy] = useState<ProtocolPolicy | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [res] = await jmapGet(OBJECT, getAccountId(OBJECT), null, [
      'name',
      'protocol',
      'bind',
      'tlsImplicit',
      'useTls',
    ]);
    setListeners(((res?.[1] as { list?: ListenerRecord[] })?.list ?? []) as ListenerRecord[]);
  }, []);

  useEffect(() => {
    let live = true;
    jmapGet(OBJECT, getAccountId(OBJECT), null, ['name', 'protocol', 'bind', 'tlsImplicit', 'useTls'])
      .then(
        ([res]) => live && setListeners(((res?.[1] as { list?: ListenerRecord[] })?.list ?? []) as ListenerRecord[]),
      )
      .catch(() => undefined);
    // An older server has no protocol policy: then nothing is switched on Hardening.
    fetchProtocolPolicy()
      .then((p) => live && setPolicy(p))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!listeners) return null;

  const { byService, custom } = classify(listeners);
  const sendingOnHardening = policy?.legacyProtocols === 'disabled' && policy.closeSubmission;
  const onHardening = (s: Service) => s.hardening || (s.group === 'send' && sendingOnHardening);

  const label: Record<string, string> = {
    smtp: t('ports.smtp', 'Receiving mail from other servers'),
    submission: t('ports.submission', 'Sending from mail apps'),
    submissions: t('ports.submissions', 'Sending from mail apps'),
    https: t('ports.https', 'Webmail, this console, JMAP apps, automatic setup'),
    http: t('ports.http', 'Redirect to HTTPS, and HTTP certificate checks'),
    imaps: t('ports.imaps', 'Reading mail in IMAP apps'),
    imap: t('ports.imap', 'Reading mail in IMAP apps'),
    pop3s: t('ports.pop3s', 'Downloading mail with POP3'),
    pop3: t('ports.pop3', 'Downloading mail with POP3'),
    sieve: t('ports.sieve', 'Editing filters from mail apps (ManageSieve)'),
  };

  const turnOn = async (s: Service) => {
    setBusy(s.id);
    try {
      const [res] = await jmapSet(OBJECT, getAccountId(OBJECT), { create: { l: listenerFor(s) } });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const bad = body?.notCreated?.l;
      if (bad || !body?.created?.l) throw new Error(bad?.description ?? bad?.type ?? 'Not created');
      await load();
      onChanged?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('ports.failed', 'Not changed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const turnOff = async (s: Service, ls: ListenerRecord[]) => {
    setBusy(s.id);
    setConfirming(null);
    try {
      const [res] = await jmapSet(OBJECT, getAccountId(OBJECT), { destroy: ls.map((l) => l.id) });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const bad = Object.values(body?.notDestroyed ?? {})[0];
      if (bad) throw new Error(bad.description ?? bad.type);
      await load();
      onChanged?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('ports.failed', 'Not changed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const row = (s: Service) => {
    const ls = byService.get(s.id) ?? [];
    const on = ls.length > 0;
    return (
      <tr key={s.id} className="align-top">
        <td className="py-2 pr-3">
          <span className="font-mono">{s.port}</span>
        </td>
        <td className="py-2 pr-3">{label[s.id]}</td>
        <td className="py-2 pr-3 text-muted-foreground">
          {encryptionWords(on ? ls[0] : { tlsImplicit: s.implicitTls, useTls: s.useTls })}
        </td>
        <td className={cn('py-2 pr-3', on ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground')}>
          {on ? t('ports.open', 'open') : t('ports.closed', 'closed')}
        </td>
        <td className="py-2 text-right">
          {onHardening(s) ? (
            <Link
              className="text-xs text-primary hover:underline"
              to={`/${hardeningSection}/CustomComponent/LegacyProtocols`}
            >
              {t('ports.onHardening', 'Switched on the Security page')}
            </Link>
          ) : confirming === s.id ? (
            <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
              <span className="text-destructive">{s.critical}</span>
              <Button type="button" size="sm" variant="destructive" className="h-7" onClick={() => void turnOff(s, ls)}>
                {t('ports.confirmOff', 'Close it')}
              </Button>
              <Button type="button" size="sm" variant="ghost" className="h-7" onClick={() => setConfirming(null)}>
                {t('common.cancel', 'Cancel')}
              </Button>
            </span>
          ) : on ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={!canDestroy || busy !== null}
              onClick={() => (s.critical ? setConfirming(s.id) : void turnOff(s, ls))}
            >
              {busy === s.id && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('ports.close', 'Close')}
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7"
              disabled={!canCreate || busy !== null}
              onClick={() => void turnOn(s)}
            >
              {busy === s.id && <Loader2 className="h-3 w-3 animate-spin" />}
              {t('ports.openIt', 'Open')}
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-3">
        <Network className="h-5 w-5 text-primary" />
        <p className="font-medium">{t('ports.title', 'The standard ports')}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 pr-3 font-medium">{t('ports.port', 'Port')}</th>
              <th className="py-1 pr-3 font-medium">{t('ports.for', 'For')}</th>
              <th className="py-1 pr-3 font-medium">{t('ports.encryption', 'Encryption')}</th>
              <th className="py-1 pr-3 font-medium">{t('ports.state', 'State')}</th>
              <th />
            </tr>
          </thead>
          <tbody className="divide-y">{SERVICES.map(row)}</tbody>
        </table>
      </div>
      {custom.length > 0 && (
        <div className="space-y-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {t('ports.custom', 'Other listeners')}
          </p>
          <ul className="space-y-0.5">
            {custom.map((l) => (
              <li key={l.id}>
                {t('ports.customLine', '{{name}}: {{protocol}} on port {{ports}}, {{tls}}.', {
                  name: l.name ?? l.id,
                  protocol: l.protocol ?? 'smtp',
                  ports: portsOf(l).join(', ') || '?',
                  tls: encryptionWords(l),
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {t(
          'ports.reach',
          'Open here means the server listens. Whether the internet can reach it also depends on your firewall and hosting provider.',
        )}
      </p>
    </div>
  );
}
