/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Security › Hardening, the server-wide legacy mail
 * protocols switches (legacy-protocols spec, LP-16, LP-17, LP-20, LP-21, and
 * "one switch per protocol").
 *
 * Each of IMAP, POP3 and ManageSieve has a switch on its row: turning one off
 * asks first, naming who used it lately and the ports that close. Turning
 * them all off at once shows the statement in full and takes a typed phrase.
 * Turning anything back on is one click: undoing a restriction must never be
 * the hard part.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Lock, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  describeListener,
  fetchProtocolPolicy,
  offProtocols,
  PolicyUnavailable,
  PROTOCOL_LABELS,
  protocolRows,
  SWITCHED,
  updateProtocolPolicy,
  usersOf,
  type ProtocolPolicy,
  type ProtocolRow,
  type SwitchedProtocol,
  type SwitchUpdate,
} from './protocolPolicy';
import { ConfirmTurnOff, ImpactPanel, ProtocolSwitch, Statement } from './parts';

type Load = { kind: 'loading' } | { kind: 'ready'; policy: ProtocolPolicy } | { kind: 'error'; message: string };

export function LegacyProtocolsPage() {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysNetworkListener', 'Update'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const loaded = useCallback(
    (fetching: Promise<ProtocolPolicy>, signal?: AbortSignal) =>
      fetching
        .then((policy) => {
          if (!signal?.aborted) setLoad({ kind: 'ready', policy });
        })
        .catch((e: unknown) => {
          if (signal?.aborted) return;
          setLoad({
            kind: 'error',
            message:
              e instanceof PolicyUnavailable
                ? t('legacyProtocols.unavailable', 'This server does not offer the legacy protocols switch.')
                : e instanceof Error
                  ? e.message
                  : String(e),
          });
        }),
    [t],
  );
  const refresh = useCallback(() => loaded(fetchProtocolPolicy()), [loaded]);

  useEffect(() => {
    const controller = new AbortController();
    void loaded(fetchProtocolPolicy(controller.signal), controller.signal);
    return () => controller.abort();
  }, [loaded]);

  const turn = useCallback(
    async (update: SwitchUpdate) => {
      setBusy(true);
      try {
        // Only switches are sent. The server may still report closeSubmission
        // overruled by the SMTP lock (LP-21), which the table already shows.
        await updateProtocolPolicy(update);
        setConfirming(false);
        await refresh();
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
    [refresh, t],
  );

  if (load.kind === 'loading') return <LoadingFallback />;
  if (load.kind === 'error') {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {load.message}
      </div>
    );
  }

  const { policy } = load;
  // All three off: the kill-all's state.
  const off = policy.legacyProtocols === 'disabled';
  // What closes: what already did while all are off, what would otherwise.
  const listeners = off ? policy.savedListeners : policy.wouldClose;
  // A protocol that is on with listeners still saved: some could not be put
  // back (LP-5). Trying again turns those protocols on again.
  const strandedOn = new Set(
    SWITCHED.filter((p) => policy.switches[p] === 'enabled' && policy.savedListeners.some((l) => l.protocol === p)),
  );
  const stranded = policy.savedListeners.filter((l) => strandedOn.has(l.protocol as SwitchedProtocol));
  const retry: SwitchUpdate = Object.fromEntries([...strandedOn].map((p) => [p, 'enabled']));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('legacyProtocols.title', 'Legacy mail protocols')}</h1>
        <p className="text-muted-foreground">
          {t(
            'legacyProtocols.subtitle',
            'Turn off IMAP, POP3 or ManageSieve one at a time, or all of them with sending from mail apps, so that only inbuxa webmail and JMAP apps can reach this server.',
          )}
        </p>
      </header>

      <StatusCard
        policy={policy}
        busy={busy}
        canUpdate={canUpdate}
        onTurnOn={() => void turn({ legacyProtocols: 'enabled' })}
      />

      {stranded.length > 0 && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="space-y-2">
              <p className="font-medium">
                {t('legacyProtocols.strandedTitle', 'Some listeners could not be reopened')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t(
                  'legacyProtocols.strandedBody',
                  'Their ports may be taken by something else, or need a restart to bind. They are kept, and can be tried again:',
                )}{' '}
                {stranded.map(describeListener).join(', ')}
              </p>
              {canUpdate && (
                <Button size="sm" variant="outline" disabled={busy} onClick={() => void turn(retry)}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('legacyProtocols.tryAgain', 'Try again')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <ProtocolTable
        policy={policy}
        rows={protocolRows(policy)}
        busy={busy}
        canUpdate={canUpdate}
        onTurn={(protocol, value) => void turn({ [protocol]: value })}
      />

      {!off && policy.recentLegacyUse && <ImpactPanel recent={policy.recentLegacyUse} />}

      {(off || confirming) && <Statement scope={{ kind: 'server', listeners }} />}

      {!off && canUpdate && !confirming && (
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          <ShieldOff className="mr-2 h-4 w-4" />
          {t('legacyProtocols.turnOffAll', 'Turn off all legacy protocols…')}
        </Button>
      )}

      {!off && confirming && (
        <ConfirmTurnOff
          busy={busy}
          onConfirm={() => void turn({ legacyProtocols: 'disabled' })}
          onCancel={() => {
            setConfirming(false);
          }}
        />
      )}
    </div>
  );
}

/** Protocol names as a sentence: "IMAP", "IMAP and POP3", "IMAP, POP3 and ManageSieve". */
function listNames(protocols: SwitchedProtocol[], and: string): string {
  const names = protocols.map((p) => PROTOCOL_LABELS[p] ?? p);
  return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;
}

function StatusCard({
  policy,
  busy,
  canUpdate,
  onTurnOn,
}: {
  policy: ProtocolPolicy;
  busy: boolean;
  canUpdate: boolean;
  onTurnOn: () => void;
}) {
  const { t } = useTranslation();
  const offList = offProtocols(policy.switches);
  const off = policy.legacyProtocols === 'disabled';
  const some = offList.length > 0 && !off;
  const Icon = off ? ShieldCheck : ShieldOff;
  const and = t('legacyProtocols.and', 'and');
  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between',
        off ? 'border-emerald-500/30 bg-emerald-500/5' : 'bg-card',
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', off ? 'text-emerald-600' : 'text-muted-foreground')} />
        <div>
          <p className="font-medium">
            {off
              ? t('legacyProtocols.statusOff', 'Legacy mail protocols are off on this server.')
              : some
                ? t('legacyProtocols.statusSome', {
                    count: offList.length,
                    list: listNames(offList, and),
                    defaultValue_one: '{{list}} is off on this server.',
                    defaultValue_other: '{{list}} are off on this server.',
                  })
                : t('legacyProtocols.statusOn', 'Legacy mail protocols are on.')}
          </p>
          <p className="text-sm text-muted-foreground">
            {off
              ? t('legacyProtocols.statusOffBody', 'Only inbuxa webmail and JMAP apps can sign in.')
              : some
                ? t('legacyProtocols.statusSomeBody', 'Mail apps can still use {{list}}, and send.', {
                    list: listNames(
                      SWITCHED.filter((p) => !offList.includes(p)),
                      and,
                    ),
                  })
                : t('legacyProtocols.statusOnBody', 'Mail apps can use IMAP, POP3 and ManageSieve.')}
            {policy.changedAt !== null && (
              <>
                {' '}
                {t('legacyProtocols.changedAt', 'Last changed {{when}}.', {
                  when: new Date(policy.changedAt).toLocaleString(),
                })}
              </>
            )}
          </p>
        </div>
      </div>
      {offList.length > 0 && canUpdate && (
        <Button variant="outline" disabled={busy} onClick={onTurnOn} className="shrink-0">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {some
            ? t('legacyProtocols.turnAllOn', 'Turn them all back on')
            : t('legacyProtocols.turnOn', 'Turn legacy protocols back on')}
        </Button>
      )}
    </div>
  );
}

function ProtocolTable({
  policy,
  rows,
  busy,
  canUpdate,
  onTurn,
}: {
  policy: ProtocolPolicy;
  rows: ProtocolRow[];
  busy: boolean;
  canUpdate: boolean;
  onTurn: (protocol: SwitchedProtocol, value: 'enabled' | 'disabled') => void;
}) {
  const { t } = useTranslation();
  const allOff = policy.legacyProtocols === 'disabled';
  const recent = policy.recentLegacyUse;
  const switched = (key: string): key is SwitchedProtocol => (SWITCHED as readonly string[]).includes(key);
  const stateText = (row: ProtocolRow) => {
    switch (row.state) {
      case 'locked':
        return row.key === 'submission'
          ? allOff
            ? t('legacyProtocols.rowRefused', 'Port open, sign-in refused')
            : t('legacyProtocols.rowSubmission', 'On; sign-in refused only with all three off')
          : t('legacyProtocols.rowLocked', 'Locked open');
      case 'refused':
        return t('legacyProtocols.rowRefused', 'Port open, sign-in refused');
      case 'closes':
        if (row.off) {
          return row.ports.length > 0
            ? t('legacyProtocols.rowClosed', 'Off, ports closed')
            : t('legacyProtocols.rowOff', 'Off');
        }
        return row.ports.length === 0
          ? t('legacyProtocols.rowNoListener', 'On, no listener')
          : t('legacyProtocols.rowOn', 'On');
    }
  };
  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t('legacyProtocols.colProtocol', 'Protocol')}</th>
            <th className="px-4 py-2 font-medium">{t('legacyProtocols.colPorts', 'Ports')}</th>
            <th className="px-4 py-2 font-medium">{t('legacyProtocols.colUsed', 'Used lately')}</th>
            <th className="px-4 py-2 font-medium">{t('legacyProtocols.colNow', 'Now')}</th>
            <th className="px-4 py-2 font-medium sr-only">{t('legacyProtocols.colSwitch', 'Switch')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const users = (switched(row.key) || row.key === 'submission') && recent ? usersOf(recent, row.key) : null;
            return (
              <tr key={row.key} className="border-t">
                <td className="px-4 py-2 font-medium">{row.label}</td>
                <td className="px-4 py-2 tabular-nums text-muted-foreground">
                  {row.ports.length > 0 ? row.ports.join(', ') : '—'}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {users === null
                    ? '—'
                    : users.length === 0
                      ? t('legacyProtocols.usedNobody', 'Nobody')
                      : t('legacyProtocols.usedCount', {
                          count: users.length,
                          defaultValue_one: '1 account',
                          defaultValue_other: '{{count}} accounts',
                        })}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1.5',
                      (row.state === 'locked' || row.off) && 'text-muted-foreground',
                    )}
                  >
                    {row.state === 'locked' && <Lock className="h-3.5 w-3.5" />}
                    {stateText(row)}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  {switched(row.key) && canUpdate && (
                    <ProtocolSwitch
                      label={row.label}
                      off={row.off === true}
                      disabled={busy}
                      users={users}
                      ports={row.ports}
                      scope={t('legacyProtocols.scopeServer', 'everyone on this server')}
                      onTurnOn={() => onTurn(row.key as SwitchedProtocol, 'enabled')}
                      onTurnOff={() => onTurn(row.key as SwitchedProtocol, 'disabled')}
                    />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        {t(
          'legacyProtocols.lockNote',
          'Incoming mail (SMTP) and inbuxa webmail (JMAP) are locked open: closing them would stop mail arriving and lock everyone out, including you.',
        )}{' '}
        {t(
          'legacyProtocols.submissionNote',
          'Sending from mail apps goes on while any of IMAP, POP3 or ManageSieve is on.',
        )}
      </p>
    </div>
  );
}
