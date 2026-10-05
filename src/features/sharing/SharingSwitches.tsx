/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: who may share mail (multi-account spec, MA-C, MA-13), on Settings ›
 * Sharing for the server and on a tenant's page for that tenant.
 *
 * Off refuses new mail shares and stops honoring the ones already made; they
 * stay stored and come back when it's on again. Groups and shared mailboxes
 * aren't people's shares and are never affected. A tenant can only be
 * stricter: a switch the server has off shows off and can't be turned on.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Share2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import {
  effectiveSwitch,
  fetchSharingPolicies,
  SERVER,
  setSharingSwitch,
  SharingPolicyUnavailable,
  type SharingKey,
  type SharingPolicy,
} from './sharingPolicy';

export function SharingSwitches({ tenantId }: { tenantId?: string }) {
  const { t } = useTranslation();
  const canGet = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Get'));
  const canUpdateTenant = useAccountStore((s) => s.hasObjectPermission('sysDomain', 'Update'));
  const canUpdateServer = useAccountStore((s) => s.hasPermission('sysSharingUpdate'));
  const [policies, setPolicies] = useState<{ server: SharingPolicy; tenant?: SharingPolicy } | null>(null);
  const [busy, setBusy] = useState<SharingKey | null>(null);

  const load = useCallback(
    (signal?: AbortSignal) =>
      fetchSharingPolicies(tenantId, signal)
        .then((p) => {
          if (!signal?.aborted) setPolicies(p);
        })
        .catch((e: unknown) => {
          // An older server has no switches: show nothing rather than an error.
          if (!signal?.aborted && !(e instanceof SharingPolicyUnavailable)) console.error(e);
        }),
    [tenantId],
  );

  useEffect(() => {
    if (!canGet) return;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [canGet, load]);

  if (!policies || (tenantId && !policies.tenant)) return null;
  const canUpdate = tenantId ? canUpdateTenant : canUpdateServer;

  const turn = async (key: SharingKey, on: boolean) => {
    setBusy(key);
    try {
      // On is the default: clearing the switch lets the server's apply
      await setSharingSwitch(tenantId ?? SERVER, key, on ? null : 'disabled');
      await load();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('sharingPolicy.failed', 'The switch did not change'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(null);
    }
  };

  const rows: { key: SharingKey; label: string; hint: string }[] = [
    {
      key: 'mailSharing',
      label: t('sharingPolicy.mailSharing', 'People may share their mail folders'),
      hint: t(
        'sharingPolicy.mailSharingHint',
        'Off: nobody can share a mail folder with someone else, and what was shared stops working until this is on again. Groups and shared mailboxes keep working.',
      ),
    },
    {
      key: 'addAccounts',
      label: t('sharingPolicy.addAccounts', 'People may add other accounts to the webmail'),
      hint: t(
        'sharingPolicy.addAccountsHint',
        'Off: the webmail doesn’t offer to sign in to a second account beside the first.',
      ),
    },
  ];

  return (
    <section className="mx-auto max-w-4xl space-y-3 rounded-xl border p-4">
      <div className="flex items-start gap-3">
        <Share2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">{t('sharingPolicy.title', 'Who may share')}</p>
          <p className="text-sm text-muted-foreground">
            {tenantId
              ? t('sharingPolicy.tenantScope', 'For everyone in this organization. It can be stricter than the server, never looser.')
              : t('sharingPolicy.serverScope', 'For everyone on this server. Each organization can be stricter on its own page.')}
          </p>
        </div>
      </div>
      {rows.map(({ key, label, hint }) => {
        const serverOff = policies.server[key] === 'disabled';
        const on = (tenantId ? effectiveSwitch(policies.server, policies.tenant, key) : policies.server[key]) === 'enabled';
        const locked = !!tenantId && serverOff;
        return (
          <label key={key} className="flex items-start justify-between gap-4 rounded-lg border p-3">
            <span className="space-y-1 text-sm">
              <span className="block font-medium">{label}</span>
              <span className="block text-muted-foreground">
                {locked ? t('sharingPolicy.serverOff', 'Off for the whole server.') : hint}
              </span>
            </span>
            <Switch
              checked={on}
              disabled={!canUpdate || locked || busy !== null}
              onCheckedChange={(v) => void turn(key, v === true)}
              aria-label={label}
            />
          </label>
        );
      })}
    </section>
  );
}
