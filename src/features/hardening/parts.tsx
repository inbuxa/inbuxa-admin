/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the parts the server's switch (Settings › Security › Hardening) and
 * a tenant's switch (each tenant's page) share: the impact panel (LP-15), the
 * statement (LP-16) and the typed confirmation (LP-17).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  ago,
  CONFIRM_PHRASE,
  describeListener,
  impactEntries,
  phraseMatches,
  type PolicyListener,
  type RecentUse,
} from './protocolPolicy';

/**
 * The typed confirmation to turn legacy protocols off (LP-17): the button
 * stays disabled until the phrase matches exactly.
 */
export function ConfirmTurnOff({
  busy,
  onConfirm,
  onCancel,
}: {
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [typed, setTyped] = useState('');
  return (
    <form
      className="space-y-3 rounded-xl border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (phraseMatches(typed)) onConfirm();
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
        <Button type="button" variant="ghost" disabled={busy} onClick={onCancel}>
          {t('common.cancel', 'Cancel')}
        </Button>
      </div>
    </form>
  );
}

/**
 * The impact panel (LP-15): who would notice, shown before anything can
 * change. With nobody, it says so in one line.
 */
export function ImpactPanel({ recent }: { recent: RecentUse[] }) {
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

/** Whose switch the statement is about: the server's, naming what closes, or a tenant's. */
export type StatementScope = { kind: 'server'; listeners: PolicyListener[] } | { kind: 'tenant'; organization: string };

/**
 * The statement (LP-16). At server scope it names the ports that close and
 * carries the firewall note (LP-20); at tenant scope no port closes, so
 * neither is said (LP-13).
 */
export function Statement({ scope }: { scope: StatementScope }) {
  const { t } = useTranslation();
  return (
    <section className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5 text-sm leading-relaxed">
      <p className="text-base font-semibold">
        {t('legacyProtocols.statementTitle', 'Only INBUXA webmail and JMAP apps will work.')}
      </p>
      <p>
        {scope.kind === 'server'
          ? t(
              'legacyProtocols.statementLead',
              'Legacy mail protocols (IMAP, POP3, ManageSieve and sending from mail apps) will be turned off for everyone on this server.',
            )
          : t(
              'legacyProtocols.statementLeadTenant',
              'Legacy mail protocols (IMAP, POP3, ManageSieve and sending from mail apps) will be turned off for everyone in {{organization}}.',
              { organization: scope.organization },
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
      {scope.kind === 'server' && (
        <p>
          {scope.listeners.length > 0
            ? t('legacyProtocols.statementPorts', 'The IMAP, POP3 and ManageSieve ports will close: {{list}}.', {
                list: scope.listeners.map(describeListener).join(', '),
              })
            : t(
                'legacyProtocols.statementNoPorts',
                'No IMAP, POP3 or ManageSieve listeners are configured, so no ports will close.',
              )}
        </p>
      )}
      <p>
        {t(
          'legacyProtocols.statementSubmission',
          'Sending from mail apps (SMTP submission) will stop working, but its ports stay open: mail apps will be told they cannot sign in. Incoming mail (SMTP) and INBUXA webmail (JMAP) are not affected and cannot be turned off here.',
        )}
      </p>
      {scope.kind === 'server' && (
        <p>
          <strong>{t('legacyProtocols.firewallLead', 'This does not change your firewall or port forwarding.')}</strong>{' '}
          {t(
            'legacyProtocols.firewallBody',
            'INBUXA stops answering on these ports; anything that still routes them to this server — firewall rules, NAT port-forwards, a load balancer or proxy — is yours to reconcile.',
          )}
        </p>
      )}
      <p>{t('legacyProtocols.statementUndo', 'You can turn legacy protocols back on at any time.')}</p>
    </section>
  );
}
