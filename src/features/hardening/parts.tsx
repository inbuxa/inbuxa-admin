/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: the parts the server's switches (Settings › Security › Hardening)
 * and a tenant's switches (each tenant's page) share: one protocol's switch
 * with its confirmation, the impact panel (LP-15), the statement (LP-16) and
 * the typed confirmation for the kill-all (LP-17).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ago,
  CONFIRM_PHRASE,
  describeListener,
  impactEntries,
  phraseMatches,
  type ImpactEntry,
  type PolicyListener,
  type RecentUse,
} from './protocolPolicy';

/** How many names the one-protocol confirmation lists before "and N more". */
const NAMES_SHOWN = 8;

/**
 * One protocol's switch. Turning it on is one click; turning it off asks
 * first, naming who used it lately and, at server scope, the ports that
 * close. Turning off one protocol takes no typed phrase: that is kept for
 * turning them all off at once (LP-17).
 */
export function ProtocolSwitch({
  label,
  off,
  disabled,
  users,
  ports,
  scope,
  onTurnOn,
  onTurnOff,
}: {
  label: string;
  off: boolean;
  disabled: boolean;
  /** Who used it lately, or null when the server doesn't say. */
  users: ImpactEntry[] | null;
  /** The ports that close, at server scope; null at tenant scope, where none do (LP-13). */
  ports: number[] | null;
  /** Who it's turned off for: "everyone on this server", "everyone in Northwind". */
  scope: string;
  onTurnOn: () => void;
  onTurnOff: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [asking, setAsking] = useState(false);
  const [now] = useState(() => Date.now());
  return (
    <>
      <Switch
        checked={!off}
        disabled={disabled}
        aria-label={t('legacyProtocols.switchLabel', '{{protocol}} on', { protocol: label })}
        onCheckedChange={(on) => (on ? onTurnOn() : setAsking(true))}
      />
      <AlertDialog open={asking} onOpenChange={setAsking}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('legacyProtocols.oneTitle', 'Turn off {{protocol}}?', { protocol: label })}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-sm">
                <p>
                  {t(
                    'legacyProtocols.oneLead',
                    'Mail apps using {{protocol}} will stop working for {{scope}}. The other protocols, sending from mail apps, and inbuxa webmail are not affected.',
                    { protocol: label, scope },
                  )}
                </p>
                {users && users.length === 0 && (
                  <p>
                    {t('legacyProtocols.oneNobody', 'No account used {{protocol}} in the last 30 days.', {
                      protocol: label,
                    })}
                  </p>
                )}
                {users && users.length > 0 && (
                  <div>
                    <p className="font-medium text-foreground">
                      {t('legacyProtocols.oneUsers', {
                        count: users.length,
                        protocol: label,
                        defaultValue_one: '1 account used {{protocol}} in the last 30 days:',
                        defaultValue_other: '{{count}} accounts used {{protocol}} in the last 30 days:',
                      })}
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {users.slice(0, NAMES_SHOWN).map((user) => (
                        <li key={user.name}>
                          {user.name}{' '}
                          <span className="text-muted-foreground">· {ago(user.lastUsedAt, now, i18n.language)}</span>
                        </li>
                      ))}
                    </ul>
                    {users.length > NAMES_SHOWN && (
                      <p className="text-muted-foreground">
                        {t('legacyProtocols.oneMore', 'and {{count}} more', { count: users.length - NAMES_SHOWN })}
                      </p>
                    )}
                  </div>
                )}
                {ports !== null && (
                  <p>
                    {ports.length > 0
                      ? t(
                          'legacyProtocols.onePorts',
                          'Its ports close: {{ports}}. Your firewall and port forwarding are not changed.',
                          {
                            ports: ports.join(', '),
                          },
                        )
                      : t('legacyProtocols.oneNoPorts', 'No {{protocol}} listener is configured, so no port closes.', {
                          protocol: label,
                        })}
                  </p>
                )}
                <p>{t('legacyProtocols.oneUndo', 'You can turn it back on at any time.')}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancel')}</AlertDialogCancel>
            <Button
              variant="destructive"
              onClick={() => {
                setAsking(false);
                onTurnOff();
              }}
            >
              {t('legacyProtocols.oneGo', 'Turn off {{protocol}}', { protocol: label })}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * The typed confirmation to turn all legacy protocols off at once (LP-17):
 * the button stays disabled until the phrase matches exactly.
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
          {t('legacyProtocols.confirmAll', 'Turn off all legacy protocols')}
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
        {t('legacyProtocols.impactLeadAll', 'Their mail apps stop working when what they use is turned off:')}
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
        {t('legacyProtocols.statementTitle', 'Only inbuxa webmail and JMAP apps will work.')}
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
            'Filters managed from a mail app (ManageSieve) will stop working. Filters set in inbuxa webmail keep working.',
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
            'People keep full access through inbuxa webmail, which can be installed as an app on phones and computers.',
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
          'Sending from mail apps (SMTP submission) will stop working, but its ports stay open: mail apps will be told they cannot sign in. Incoming mail (SMTP) and inbuxa webmail (JMAP) are not affected and cannot be turned off here.',
        )}
      </p>
      {scope.kind === 'server' && (
        <p>
          <strong>{t('legacyProtocols.firewallLead', 'This does not change your firewall or port forwarding.')}</strong>{' '}
          {t(
            'legacyProtocols.firewallBody',
            'inbuxa stops answering on these ports; anything that still routes them to this server — firewall rules, NAT port-forwards, a load balancer or proxy — is yours to reconcile.',
          )}
        </p>
      )}
      <p>{t('legacyProtocols.statementUndo', 'You can turn legacy protocols back on at any time.')}</p>
    </section>
  );
}
