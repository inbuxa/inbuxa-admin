/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Security › Hardening, the server-wide legacy mail
 * protocols switch (legacy-protocols spec, LP-16, LP-17, LP-20, LP-21).
 *
 * Nobody should turn this on by accident or without understanding it, so the
 * statement is shown in full before the switch moves, and turning it on takes
 * a typed phrase. Turning it back on is one click: undoing a restriction must
 * never be the hard part.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, Lock, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  ago,
  CONFIRM_PHRASE,
  describeListener,
  impactEntries,
  fetchProtocolPolicy,
  phraseMatches,
  PolicyUnavailable,
  protocolRows,
  updateProtocolPolicy,
  type PolicyListener,
  type ProtocolPolicy,
  type ProtocolRow,
  type RecentUse,
} from './protocolPolicy';

type Load = { kind: 'loading' } | { kind: 'ready'; policy: ProtocolPolicy } | { kind: 'error'; message: string };

export function LegacyProtocolsPage() {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysNetworkListener', 'Update'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
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
    async (legacyProtocols: 'enabled' | 'disabled') => {
      setBusy(true);
      try {
        // Only legacyProtocols is sent. The server may still report closeSubmission
        // overruled by the SMTP lock (LP-21), which the selector already shows.
        await updateProtocolPolicy({ legacyProtocols });
        setConfirming(false);
        setTyped('');
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
  const off = policy.legacyProtocols === 'disabled';
  // What closes: what already did while the switch is off, what would otherwise.
  const listeners = off ? policy.savedListeners : policy.wouldClose;
  // Enabled with listeners still saved: some could not be put back (LP-5).
  const stranded = off ? [] : policy.savedListeners;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('legacyProtocols.title', 'Legacy mail protocols')}</h1>
        <p className="text-muted-foreground">
          {t(
            'legacyProtocols.subtitle',
            'Turn off IMAP, POP3, ManageSieve and sending from mail apps, so that only INBUXA webmail and JMAP apps can reach this server.',
          )}
        </p>
      </header>

      <StatusCard policy={policy} off={off} busy={busy} canUpdate={canUpdate} onTurnOn={() => turn('enabled')} />

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
                <Button size="sm" variant="outline" disabled={busy} onClick={() => turn('enabled')}>
                  <RotateCcw className="mr-2 h-4 w-4" />
                  {t('legacyProtocols.tryAgain', 'Try again')}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      <ProtocolTable rows={protocolRows(policy, listeners)} off={off} />

      {!off && policy.recentLegacyUse && <ImpactPanel recent={policy.recentLegacyUse} />}

      {(off || confirming) && <Statement listeners={listeners} />}

      {!off && canUpdate && !confirming && (
        <Button variant="destructive" onClick={() => setConfirming(true)}>
          <ShieldOff className="mr-2 h-4 w-4" />
          {t('legacyProtocols.turnOff', 'Turn off legacy protocols…')}
        </Button>
      )}

      {!off && confirming && (
        <form
          className="space-y-3 rounded-xl border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (phraseMatches(typed)) void turn('disabled');
          }}
        >
          <Label htmlFor="legacy-confirm">
            {t('legacyProtocols.typeToConfirm', 'To confirm, type')}{' '}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm">{CONFIRM_PHRASE}</code>
          </Label>
          <Input
            id="legacy-confirm"
            autoComplete="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
          />
          <div className="flex gap-2">
            <Button type="submit" variant="destructive" disabled={busy || !phraseMatches(typed)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('legacyProtocols.confirm', 'Turn off legacy protocols')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setTyped('');
              }}
            >
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function StatusCard({
  policy,
  off,
  busy,
  canUpdate,
  onTurnOn,
}: {
  policy: ProtocolPolicy;
  off: boolean;
  busy: boolean;
  canUpdate: boolean;
  onTurnOn: () => void;
}) {
  const { t } = useTranslation();
  const Icon = off ? ShieldCheck : ShieldOff;
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
              : t('legacyProtocols.statusOn', 'Legacy mail protocols are on.')}
          </p>
          <p className="text-sm text-muted-foreground">
            {off
              ? t('legacyProtocols.statusOffBody', 'Only INBUXA webmail and JMAP apps can sign in.')
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
      {off && canUpdate && (
        <Button variant="outline" disabled={busy} onClick={onTurnOn} className="shrink-0">
          {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('legacyProtocols.turnOn', 'Turn legacy protocols back on')}
        </Button>
      )}
    </div>
  );
}

function ProtocolTable({ rows, off }: { rows: ProtocolRow[]; off: boolean }) {
  const { t } = useTranslation();
  const stateText = (row: ProtocolRow) => {
    switch (row.state) {
      case 'locked':
        return t('legacyProtocols.rowLocked', 'Locked open');
      case 'refused':
        return t('legacyProtocols.rowRefused', 'Port open, sign-in refused');
      case 'closes':
        if (row.ports.length === 0) return t('legacyProtocols.rowNoListener', 'No listener');
        return off ? t('legacyProtocols.rowClosed', 'Closed') : t('legacyProtocols.rowWouldClose', 'Closes');
    }
  };
  return (
    <div className="overflow-hidden rounded-xl border">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2 font-medium">{t('legacyProtocols.colProtocol', 'Protocol')}</th>
            <th className="px-4 py-2 font-medium">{t('legacyProtocols.colPorts', 'Ports')}</th>
            <th className="px-4 py-2 font-medium">
              {off ? t('legacyProtocols.colNow', 'Now') : t('legacyProtocols.colWhenOff', 'When turned off')}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t">
              <td className="px-4 py-2 font-medium">{row.label}</td>
              <td className="px-4 py-2 tabular-nums text-muted-foreground">
                {row.ports.length > 0 ? row.ports.join(', ') : '—'}
              </td>
              <td className="px-4 py-2">
                <span
                  className={cn('inline-flex items-center gap-1.5', row.state === 'locked' && 'text-muted-foreground')}
                >
                  {row.state === 'locked' && <Lock className="h-3.5 w-3.5" />}
                  {stateText(row)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        {t(
          'legacyProtocols.lockNote',
          'Incoming mail (SMTP) and INBUXA webmail (JMAP) are locked open: closing them would stop mail arriving and lock everyone out, including you.',
        )}
      </p>
    </div>
  );
}

/**
 * The impact panel (LP-15): who would notice, shown before anything can
 * change. With nobody, it says so in one line.
 */
function ImpactPanel({ recent }: { recent: RecentUse[] }) {
  const { t, i18n } = useTranslation();
  const entries = impactEntries(recent);
  // Read once, when the panel appears: "2 days ago" needn't tick.
  const [now] = useState(() => Date.now());
  if (entries.length === 0) {
    return (
      <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
        {t('legacyProtocols.impactNone', 'No account used a legacy mail app in the last 30 days.')}
      </p>
    );
  }
  return (
    <section className="space-y-2 rounded-xl border p-4 text-sm">
      <p>
        <strong>
          {t('legacyProtocols.impactCount', {
            count: entries.length,
            defaultValue_one: '1 account used a legacy mail app in the last 30 days.',
            defaultValue_other: '{{count}} accounts used a legacy mail app in the last 30 days.',
          })}
        </strong>{' '}
        {t('legacyProtocols.impactLead', 'Their mail apps will stop working the moment you turn this on:')}
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.name} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{entry.name}</span>
            <span className="text-muted-foreground">
              {entry.protocols.join(', ')} · {ago(entry.lastUsedAt, now, i18n.language)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The statement (LP-16), at server scope, with the firewall note (LP-20). */
function Statement({ listeners }: { listeners: PolicyListener[] }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm leading-relaxed">
      <p className="text-base font-semibold">
        {t('legacyProtocols.statementTitle', 'Only INBUXA webmail and JMAP apps will work.')}
      </p>
      <p>
        {t(
          'legacyProtocols.statementLead',
          'Legacy mail protocols (IMAP, POP3, ManageSieve and sending from mail apps) will be turned off for everyone on this server.',
        )}
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          {t(
            'legacyProtocols.statementApps',
            'Phone and desktop mail apps will stop receiving and sending mail. That’s iPhone and iPad Mail, the Gmail and Outlook apps, Outlook, Thunderbird and Apple Mail. People will see sign-in errors in them.',
          )}
        </li>
        <li>
          {t(
            'legacyProtocols.statementFilters',
            'Filters managed from a mail app (ManageSieve) will stop working. Filters set in INBUXA webmail keep working.',
          )}
        </li>
        <li>
          {t(
            'legacyProtocols.statementUnaffected',
            'Incoming mail is not affected. Calendars and contacts are not affected.',
          )}
        </li>
        <li>
          {t(
            'legacyProtocols.statementWebmail',
            'People keep full access through INBUXA webmail, which can be installed as an app on phones and computers.',
          )}
        </li>
      </ul>
      <p>
        {listeners.length > 0
          ? t('legacyProtocols.statementPorts', 'The IMAP, POP3 and ManageSieve ports will close: {{list}}.', {
              list: listeners.map(describeListener).join(', '),
            })
          : t(
              'legacyProtocols.statementNoPorts',
              'No IMAP, POP3 or ManageSieve listeners are configured, so no ports will close.',
            )}
      </p>
      <p>
        {t(
          'legacyProtocols.statementSubmission',
          'Sending from mail apps (SMTP submission) will stop working, but its ports stay open: mail apps will be told they cannot sign in. Incoming mail (SMTP) and INBUXA webmail (JMAP) are not affected and cannot be turned off here.',
        )}
      </p>
      <p>
        <strong>{t('legacyProtocols.firewallLead', 'This does not change your firewall or port forwarding.')}</strong>{' '}
        {t(
          'legacyProtocols.firewallBody',
          'INBUXA stops answering on these ports; anything that still routes them to this server — firewall rules, NAT port-forwards, a load balancer or proxy — is yours to reconcile.',
        )}
      </p>
      <p>{t('legacyProtocols.statementUndo', 'You can turn legacy protocols back on at any time.')}</p>
    </section>
  );
}
