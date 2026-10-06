/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: one tenant's legacy mail protocols switches, on the tenant's page
 * (legacy-protocols spec, LP-9 to LP-18 at tenant scope, and "one switch per
 * protocol").
 *
 * They close no port -- other tenants share them (LP-13) -- so nothing here
 * names a listener or carries a firewall note. They refuse sign-in over each
 * protocol on the tenant's domains. One protocol off asks first; all of them
 * off takes the typed phrase; back on is one click, which the server refuses
 * while it has that protocol off itself (LP-9), and says which.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getAccountId, jmapGet } from '@/services/jmap/client';
import {
  fetchProtocolPolicy,
  fetchTenantPolicy,
  offProtocols,
  PolicyUnavailable,
  PROTOCOL_LABELS,
  SWITCHED,
  updateTenantPolicy,
  usersOf,
  type Switches,
  type SwitchUpdate,
  type TenantPolicy,
} from './protocolPolicy';
import { ConfirmTurnOff, ImpactPanel, ProtocolSwitch, Statement } from './parts';

export function TenantLegacyProtocols({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Get'));
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Update'));
  const [policy, setPolicy] = useState<TenantPolicy | null>(null);
  // The server's own switches, which a server administrator can read: a
  // protocol off there is off for this tenant whatever its switch says.
  const [server, setServer] = useState<Switches | null>(null);
  const [organization, setOrganization] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const loaded = useCallback(
    (fetching: Promise<TenantPolicy>, signal?: AbortSignal) =>
      fetching
        .then((p) => {
          if (!signal?.aborted) setPolicy(p);
        })
        .catch((e: unknown) => {
          // An older server has no tenant switch: show nothing rather than an error.
          if (!signal?.aborted && !(e instanceof PolicyUnavailable)) console.error(e);
        }),
    [],
  );

  const loadServer = useCallback((signal?: AbortSignal) => {
    fetchProtocolPolicy(signal)
      .then((p) => {
        if (!signal?.aborted) setServer(p.switches);
      })
      // Inside a tenant the server's switches aren't readable; the server
      // still refuses what they forbid, and says so.
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    void loaded(fetchTenantPolicy(tenantId, controller.signal), controller.signal);
    loadServer(controller.signal);
    // The organization's name, for the statement.
    jmapGet('x:Tenant', getAccountId('x:Tenant'), [tenantId], ['name'], controller.signal)
      .then((responses) => {
        const list = (responses[0]?.[1] as { list?: { name?: string }[] } | undefined)?.list;
        if (!controller.signal.aborted && list?.[0]?.name) setOrganization(list[0].name);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tenantId, canGet, loaded, loadServer]);

  const turn = useCallback(
    async (update: SwitchUpdate) => {
      setBusy(true);
      try {
        await updateTenantPolicy(tenantId, update);
        setConfirming(false);
        await loaded(fetchTenantPolicy(tenantId));
      } catch (e) {
        toast({
          variant: 'destructive',
          title: t('legacyProtocols.failed', 'The switch did not change'),
          description: e instanceof Error ? e.message : String(e),
        });
      } finally {
        setBusy(false);
      }
    },
    [tenantId, loaded, t],
  );

  if (!policy) return null;
  const off = policy.legacyProtocols === 'disabled';
  const offList = offProtocols(policy.switches);
  const name = organization || t('legacyProtocols.thisOrganization', 'this organization');
  const scope = t('legacyProtocols.scopeTenant', 'everyone in {{organization}}', { organization: name });

  return (
    // Aligned with the tenant form beneath it.
    <section className="mx-auto max-w-4xl space-y-4 rounded-xl border p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {off ? (
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <ShieldOff className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium">{t('legacyProtocols.title', 'Legacy mail protocols')}</p>
            <p className={cn('text-sm', off ? 'text-foreground' : 'text-muted-foreground')}>
              {off
                ? t(
                    'legacyProtocols.tenantOff',
                    'Off for {{organization}}. Only inbuxa webmail and JMAP apps can sign in to its domains.',
                    { organization: name },
                  )
                : offList.length > 0
                  ? t(
                      'legacyProtocols.tenantSome',
                      'Some are off for {{organization}}. Mail apps can still send, and use what is on.',
                      { organization: name },
                    )
                  : t(
                      'legacyProtocols.tenantOn',
                      'On for {{organization}}. Mail apps can use IMAP, POP3 and ManageSieve on its domains.',
                      { organization: name },
                    )}
            </p>
          </div>
        </div>
        {canUpdate && offList.length > 0 && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => void turn({ legacyProtocols: 'enabled' })}
            className="shrink-0"
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {off
              ? t('legacyProtocols.turnOn', 'Turn legacy protocols back on')
              : t('legacyProtocols.turnAllOn', 'Turn them all back on')}
          </Button>
        )}
        {canUpdate && !off && !confirming && (
          <Button variant="destructive" onClick={() => setConfirming(true)} className="shrink-0">
            {t('legacyProtocols.turnOffAll', 'Turn off all legacy protocols…')}
          </Button>
        )}
      </div>

      <ul className="divide-y rounded-lg border text-sm">
        {SWITCHED.map((protocol) => {
          const label = PROTOCOL_LABELS[protocol] ?? protocol;
          const serverOff = server?.[protocol] === 'disabled';
          const tenantOff = policy.switches[protocol] === 'disabled';
          const users = policy.recentLegacyUse ? usersOf(policy.recentLegacyUse, protocol) : null;
          return (
            <li key={protocol} className="flex items-center justify-between gap-3 px-4 py-2">
              <div>
                <span className="font-medium">{label}</span>{' '}
                <span className="text-muted-foreground">
                  {serverOff
                    ? t('legacyProtocols.offServerWide', 'Off for the whole server')
                    : tenantOff
                      ? t('legacyProtocols.rowOff', 'Off')
                      : t('legacyProtocols.rowOn', 'On')}
                  {users !== null &&
                    users.length > 0 &&
                    ` · ${t('legacyProtocols.usedCount', {
                      count: users.length,
                      defaultValue_one: '1 account',
                      defaultValue_other: '{{count}} accounts',
                    })}`}
                </span>
              </div>
              {canUpdate && (
                <ProtocolSwitch
                  label={label}
                  off={tenantOff || serverOff}
                  disabled={busy || serverOff}
                  users={users}
                  ports={null}
                  scope={scope}
                  onTurnOn={() => void turn({ [protocol]: 'enabled' })}
                  onTurnOff={() => void turn({ [protocol]: 'disabled' })}
                />
              )}
            </li>
          );
        })}
      </ul>

      {!off && confirming && (
        <>
          {policy.recentLegacyUse && <ImpactPanel recent={policy.recentLegacyUse} />}
          <Statement scope={{ kind: 'tenant', organization: name }} />
          <ConfirmTurnOff
            busy={busy}
            onConfirm={() => void turn({ legacyProtocols: 'disabled' })}
            onCancel={() => setConfirming(false)}
          />
        </>
      )}
    </section>
  );
}
