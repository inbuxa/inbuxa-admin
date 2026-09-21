/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: one tenant's legacy mail protocols switch, on the tenant's page
 * (legacy-protocols spec, LP-9 to LP-18 at tenant scope).
 *
 * It closes no port -- other tenants share them (LP-13) -- so the statement
 * names no listener and carries no firewall note. It refuses sign-in over
 * legacy protocols on the tenant's domains. Turning it off takes the typed
 * phrase; turning it back on is one click, which the server refuses while
 * it has legacy protocols off itself (LP-9), and says so.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { getAccountId, jmapGet } from '@/services/jmap/client';
import { fetchTenantPolicy, PolicyUnavailable, updateTenantPolicy, type TenantPolicy } from './protocolPolicy';
import { ConfirmTurnOff, ImpactPanel, Statement } from './parts';

export function TenantLegacyProtocols({ tenantId }: { tenantId: string }) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Get'));
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Update'));
  const [policy, setPolicy] = useState<TenantPolicy | null>(null);
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

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    void loaded(fetchTenantPolicy(tenantId, controller.signal), controller.signal);
    // The organization's name, for the statement.
    jmapGet('x:Tenant', getAccountId('x:Tenant'), [tenantId], ['name'], controller.signal)
      .then((responses) => {
        const list = (responses[0]?.[1] as { list?: { name?: string }[] } | undefined)?.list;
        if (!controller.signal.aborted && list?.[0]?.name) setOrganization(list[0].name);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [tenantId, canGet, loaded]);

  const turn = useCallback(
    async (value: 'enabled' | 'disabled') => {
      setBusy(true);
      try {
        await updateTenantPolicy(tenantId, value);
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
  const name = organization || t('legacyProtocols.thisOrganization', 'this organization');

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
                    'Off for {{organization}}. Only INBUXA webmail and JMAP apps can sign in to its domains.',
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
        {canUpdate && off && (
          <Button variant="outline" disabled={busy} onClick={() => void turn('enabled')} className="shrink-0">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('legacyProtocols.turnOn', 'Turn legacy protocols back on')}
          </Button>
        )}
        {canUpdate && !off && !confirming && (
          <Button variant="destructive" onClick={() => setConfirming(true)} className="shrink-0">
            {t('legacyProtocols.turnOff', 'Turn off legacy protocols…')}
          </Button>
        )}
      </div>

      {!off && confirming && (
        <>
          {policy.recentLegacyUse && <ImpactPanel recent={policy.recentLegacyUse} />}
          <Statement scope={{ kind: 'tenant', organization: name }} />
          <ConfirmTurnOff busy={busy} onConfirm={() => void turn('disabled')} onCancel={() => setConfirming(false)} />
        </>
      )}
    </section>
  );
}
