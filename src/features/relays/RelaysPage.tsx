/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Mail flow › Relays (relay spec, "inbuxa-admin"): the
 * inbuxa Relays this server links to. Adding one shows its join token once,
 * with the command to run on the relay host. The list says something only
 * when a relay needs attention. Each relay has its settings, which the
 * server pushes to it, and its queues, read over the server's link, where
 * held mail can be discarded and outbound mail cancelled.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, Check, Copy, Inbox, Loader2, Plus, RefreshCw, Send, Settings2, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { HelpTip } from '@/help/HelpTip';
import { fieldHelp } from '@/help/texts';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { formatSize } from '@/features/hold/legalHold';
import {
  createRelay,
  deleteRelay,
  destroyRelayMessage,
  fetchRelayMessages,
  fetchRelays,
  rejoinRelay,
  RelaysUnavailable,
  RelayUnreachable,
  updateRelay,
} from './api';
import {
  attention,
  envelopeLine,
  joinCommand,
  latestStatus,
  settingsPatch,
  toForm,
  waiting,
  type Attention,
  type Relay,
  type RelayMessage,
  type SettingsForm,
} from './model';

type Load = { kind: 'loading' } | { kind: 'ready'; relays: Relay[] } | { kind: 'error'; message: string };

function when(iso?: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function failed(title: string, e: unknown) {
  toast({ variant: 'destructive', title, description: errorText(e) });
}

/** A label with the option's ⓘ, keyed `inbuxa:Relay.<field>`. */
function Field({ field, label, children }: { field: string; label: string; children: ReactNode }) {
  const id = `inbuxa:Relay.${field}`;
  return (
    <label className="block space-y-1 text-sm">
      <span className="flex items-center gap-1.5 text-muted-foreground">
        {label}
        <HelpTip id={id} text={fieldHelp(id)} />
      </span>
      {children}
    </label>
  );
}

function ToggleField({
  field,
  label,
  checked,
  onChange,
  disabled,
}: {
  field: string;
  label: string;
  checked: boolean;
  onChange: (on: boolean) => void;
  disabled?: boolean;
}) {
  const id = `inbuxa:Relay.${field}`;
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-1.5">
        {label}
        <HelpTip id={id} text={fieldHelp(id)} />
      </span>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

function attentionText(t: TFunction, a: Attention): string {
  switch (a.kind) {
    case 'joinWaiting':
      return a.until
        ? t('relays.att.joinWaiting', 'Waiting for the relay to join, until {{until}}.', { until: when(a.until) })
        : t('relays.att.joinWaitingNow', 'Waiting for the relay to join.');
    case 'joinExpired':
      return t('relays.att.joinExpired', 'The join token ran out before the relay joined. Start a new join.');
    case 'notLinked':
      return t('relays.att.notLinked', 'No node has linked to it yet.');
    case 'linkDown':
      return a.error
        ? t('relays.att.linkDownWhy', 'Node {{node}} has no link since {{since}}: {{error}}', {
            node: a.nodeId,
            since: when(a.since),
            error: a.error,
          })
        : t('relays.att.linkDown', 'Node {{node}} has no link since {{since}}.', {
            node: a.nodeId,
            since: when(a.since),
          });
    case 'joinFailed':
      return t('relays.att.joinFailed', 'Node {{node}} couldn’t join it{{why}}. Start a new join.', {
        node: a.nodeId,
        why: a.error ? `: ${a.error}` : '',
      });
    case 'spoolFilling':
      return t('relays.att.spool', 'Its spool is {{percent}}% full.', { percent: a.percent });
    case 'certificateExpiring':
      return t('relays.att.certSoon', 'Its certificate runs out {{when}}.', { when: when(a.notAfter) });
    case 'certificateExpired':
      return t('relays.att.certGone', 'Its certificate ran out {{when}}.', { when: when(a.notAfter) });
    case 'relayError':
      return t('relays.att.relayError', 'The relay reports: {{error}}', { error: a.error });
    case 'recipientsDiffer':
      return t('relays.att.recipients', 'Nodes sent it different recipient lists; one of them is out of date.');
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="mr-2 h-4 w-4 text-emerald-500" /> : <Copy className="mr-2 h-4 w-4" />}
      {done ? t('relays.copied', 'Copied') : label}
    </Button>
  );
}

/** The join token, once, and the one command that uses it. */
function TokenDialog({ name, token, onClose }: { name: string; token: string; onClose: () => void }) {
  const { t } = useTranslation();
  const command = joinCommand(token);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('relays.tokenTitle', 'Join {{name}}', { name })}</DialogTitle>
          <DialogDescription>
            {t(
              'relays.tokenBody',
              'Run this on the relay host within 24 hours. The token is shown only now: copy it before closing.',
            )}
          </DialogDescription>
        </DialogHeader>
        <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-md border bg-muted/40 p-3 font-mono text-xs">
          {command}
        </pre>
        <DialogFooter>
          <CopyButton text={command} label={t('relays.copyCommand', 'Copy the command')} />
          <Button onClick={onClose}>{t('relays.done', 'Done')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (name: string, token: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [port, setPort] = useState('443');
  const [hostname, setHostname] = useState('');
  const [busy, setBusy] = useState(false);
  const portValid = /^\d+$/.test(port) && Number(port) >= 1 && Number(port) <= 65535;
  const ready = name.trim() && address.trim() && hostname.trim() && portValid;

  const add = async () => {
    setBusy(true);
    try {
      const { joinToken } = await createRelay({ name, address, linkPort: Number(port), hostname });
      onAdded(name.trim(), joinToken);
    } catch (e) {
      failed(t('relays.addFailed', 'The relay wasn’t added'), e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('relays.addTitle', 'Add a relay')}</DialogTitle>
          <DialogDescription>
            {t(
              'relays.addBody',
              'Install inbuxa-relay on the edge host first. Then add it here, and run the command shown next on that host.',
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field field="name" label={t('relays.f.name', 'Name')}>
            <Input value={name} maxLength={64} onChange={(e) => setName(e.target.value)} autoComplete="off" />
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field field="address" label={t('relays.f.address', 'Link address')}>
              <Input
                value={address}
                placeholder="10.8.0.2"
                onChange={(e) => setAddress(e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field field="linkPort" label={t('relays.f.linkPort', 'Link port')}>
              <Input value={port} inputMode="numeric" onChange={(e) => setPort(e.target.value)} autoComplete="off" />
            </Field>
          </div>
          <Field field="hostname" label={t('relays.f.hostname', 'Public name')}>
            <Input
              value={hostname}
              placeholder="mx1.example.com"
              onChange={(e) => setHostname(e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('relays.cancel', 'Cancel')}
          </Button>
          <Button onClick={() => void add()} disabled={busy || !ready}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('relays.addGo', 'Add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface General {
  name: string;
  description: string;
  address: string;
  linkPort: string;
  enabled: boolean;
  sendThrough: boolean;
  inboundOnly: boolean;
}

function general(relay: Relay): General {
  return {
    name: relay.name,
    description: relay.description,
    address: relay.address,
    linkPort: String(relay.linkPort),
    enabled: relay.enabled,
    sendThrough: relay.sendThrough,
    inboundOnly: relay.inboundOnly,
  };
}

function SettingsDialog({
  relay,
  canChange,
  onClose,
  onSaved,
}: {
  relay: Relay;
  canChange: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const startGeneral = useMemo(() => general(relay), [relay]);
  const startForm = useMemo(() => toForm(relay.settings), [relay]);
  const [g, setG] = useState(startGeneral);
  const [form, setForm] = useState<SettingsForm>(startForm);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState<string | null>(null);
  const set = (field: keyof SettingsForm) => (e: { target: { value: string } }) =>
    setForm({ ...form, [field]: e.target.value });
  const input = (field: keyof SettingsForm, extra: { placeholder?: string; inputMode?: 'numeric' } = {}) => (
    <Input
      value={form[field]}
      onChange={set(field)}
      disabled={!canChange}
      aria-invalid={invalid === field}
      autoComplete="off"
      {...extra}
    />
  );

  const save = async () => {
    const result = settingsPatch(startForm, form, relay.settings);
    if ('invalid' in result) {
      setInvalid(result.invalid);
      return;
    }
    const patch: Record<string, unknown> = { ...result.patch };
    if (g.name !== startGeneral.name) patch.name = g.name.trim();
    if (g.description !== startGeneral.description) patch.description = g.description.trim();
    if (g.address !== startGeneral.address) patch.address = g.address.trim();
    if (g.linkPort !== startGeneral.linkPort) {
      if (!/^\d+$/.test(g.linkPort) || Number(g.linkPort) < 1 || Number(g.linkPort) > 65535) {
        setInvalid('linkPort');
        return;
      }
      patch.linkPort = Number(g.linkPort);
    }
    for (const flag of ['enabled', 'sendThrough', 'inboundOnly'] as const) {
      if (g[flag] !== startGeneral[flag]) patch[flag] = g[flag];
    }
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      await updateRelay(relay.id, patch, reason);
      toast({ title: t('relays.saved', 'Saved. The relay gets it within seconds.') });
      onSaved();
    } catch (e) {
      failed(t('relays.saveFailed', 'Nothing was saved'), e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('relays.settingsTitle', '{{name}} settings', { name: relay.name })}</DialogTitle>
          <DialogDescription>
            {t('relays.settingsBody', 'This server pushes these to the relay. The relay has no settings of its own.')}
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t('relays.s.general', 'The relay')}</h3>
          <Field field="name" label={t('relays.f.name', 'Name')}>
            <Input
              value={g.name}
              maxLength={64}
              disabled={!canChange}
              onChange={(e) => setG({ ...g, name: e.target.value })}
            />
          </Field>
          <Field field="description" label={t('relays.f.description', 'Description')}>
            <Input
              value={g.description}
              disabled={!canChange}
              onChange={(e) => setG({ ...g, description: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <Field field="address" label={t('relays.f.address', 'Link address')}>
              <Input
                value={g.address}
                disabled={!canChange}
                onChange={(e) => setG({ ...g, address: e.target.value })}
              />
            </Field>
            <Field field="linkPort" label={t('relays.f.linkPort', 'Link port')}>
              <Input
                value={g.linkPort}
                inputMode="numeric"
                disabled={!canChange}
                aria-invalid={invalid === 'linkPort'}
                onChange={(e) => setG({ ...g, linkPort: e.target.value })}
              />
            </Field>
          </div>
          <ToggleField
            field="enabled"
            label={t('relays.f.enabled', 'Linked')}
            checked={g.enabled}
            disabled={!canChange}
            onChange={(enabled) => setG({ ...g, enabled })}
          />
          <ToggleField
            field="sendThrough"
            label={t('relays.f.sendThrough', 'Send all outgoing mail through relays')}
            checked={g.sendThrough}
            disabled={!canChange || g.inboundOnly}
            onChange={(sendThrough) => setG({ ...g, sendThrough })}
          />
          <ToggleField
            field="inboundOnly"
            label={t('relays.f.inboundOnly', 'Takes mail in only')}
            checked={g.inboundOnly}
            disabled={!canChange || g.sendThrough}
            onChange={(inboundOnly) => setG({ ...g, inboundOnly })}
          />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t('relays.s.receiving', 'Taking mail in')}</h3>
          <Field field="hostname" label={t('relays.f.hostname', 'Public name')}>
            {input('hostname', { placeholder: 'mx1.example.com' })}
          </Field>
          <Field field="smtpListen" label={t('relays.f.smtpListen', 'Listens on')}>
            {input('smtpListen', { placeholder: '[::]:25' })}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field field="maxMessageSize" label={t('relays.f.maxMessageSize', 'Largest message (MB)')}>
              {input('maxMessageSizeMb', { inputMode: 'numeric' })}
            </Field>
            <Field field="maxRecipients" label={t('relays.f.maxRecipients', 'Recipients per message')}>
              {input('maxRecipients', { inputMode: 'numeric' })}
            </Field>
          </div>
          <Field field="rateLimits" label={t('relays.f.rateLimits', 'Per sending address')}>
            <div className="grid grid-cols-3 gap-3">
              <span className="space-y-1">
                <span className="text-xs">{t('relays.f.connectionsPerMinute', 'Connections a minute')}</span>
                {input('connectionsPerMinute', { inputMode: 'numeric' })}
              </span>
              <span className="space-y-1">
                <span className="text-xs">{t('relays.f.messagesPerMinute', 'Messages a minute')}</span>
                {input('messagesPerMinute', { inputMode: 'numeric' })}
              </span>
              <span className="space-y-1">
                <span className="text-xs">{t('relays.f.concurrentSessions', 'At once')}</span>
                {input('concurrentSessions', { inputMode: 'numeric' })}
              </span>
            </div>
          </Field>
          <Field field="dnsbl" label={t('relays.f.dnsbl', 'Blocklists while this server is unreachable')}>
            {input('dnsbl', { placeholder: 'zen.example.org' })}
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field field="liveVerdictTimeout" label={t('relays.f.liveVerdictTimeout', 'Wait for an answer')}>
              {input('liveVerdictTimeout', { placeholder: '30s' })}
            </Field>
            <Field field="heldMaxAge" label={t('relays.f.heldMaxAge', 'Hold mail (days)')}>
              {input('heldMaxAge', { inputMode: 'numeric' })}
            </Field>
            <Field field="spoolMaxBytes" label={t('relays.f.spoolMaxBytes', 'Spool size (GB)')}>
              {input('spoolMaxGb', { inputMode: 'numeric' })}
            </Field>
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-medium">{t('relays.s.sending', 'Sending mail on')}</h3>
          <Field field="outboundRetry" label={t('relays.f.outboundRetry', 'Waits between attempts')}>
            {input('outboundRetry', { placeholder: '2m, 5m, 10m, 30m, 1h' })}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field field="outboundExpiry" label={t('relays.f.outboundExpiry', 'Give up after')}>
              {input('outboundExpiry', { placeholder: '3d' })}
            </Field>
            <Field field="outboundTls" label={t('relays.f.outboundTls', 'Encryption')}>
              <Select
                value={form.outboundTls}
                disabled={!canChange}
                onValueChange={(v) => setForm({ ...form, outboundTls: v as SettingsForm['outboundTls'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="opportunistic">{t('relays.tls.opportunistic', 'When offered')}</SelectItem>
                  <SelectItem value="required">{t('relays.tls.required', 'Always')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
        </section>

        {invalid && (
          <p className="text-sm text-destructive">
            {t('relays.invalid', 'One value doesn’t read: check the field marked in red.')}
          </p>
        )}
        {canChange && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t('relays.reason', 'Reason, for the audit log (optional)')}</span>
            <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
          </label>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {canChange ? t('relays.cancel', 'Cancel') : t('relays.close', 'Close')}
          </Button>
          {canChange && (
            <Button onClick={() => void save()} disabled={busy}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('relays.save', 'Save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MessageLine({
  message,
  canChange,
  onDestroy,
}: {
  message: RelayMessage;
  canChange: boolean;
  onDestroy: () => void;
}) {
  const { t } = useTranslation();
  const { from, to } = envelopeLine(message);
  const inbound = message.direction === 'inbound';
  const stillWaiting = inbound ? [] : waiting(message);
  return (
    <li className="space-y-1 rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <p className="flex flex-wrap items-center gap-2">
            <Badge variant={inbound ? 'secondary' : 'outline'}>
              {inbound ? t('relays.q.in', 'In') : t('relays.q.out', 'Out')}
            </Badge>
            <span className="break-all">{t('relays.q.fromTo', '{{from}} to {{to}}', { from, to: to.join(', ') })}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {when(message.createdAt)} · {formatSize(message.size)}
            {inbound && message.state && (
              <>
                {' · '}
                {message.state === 'held'
                  ? t('relays.q.held', 'waiting for this server')
                  : message.state === 'pending'
                    ? t('relays.q.pending', 'waiting for an answer')
                    : t('relays.q.claimed', 'being taken now')}
              </>
            )}
            {!inbound && message.nextAttemptAt && (
              <>
                {' · '}
                {t('relays.q.next', 'next try {{when}}', { when: when(message.nextAttemptAt) })}
              </>
            )}
          </p>
          {stillWaiting.map((w) => (
            <p key={w.to} className="break-all text-xs text-muted-foreground">
              {w.reply
                ? t('relays.q.reply', '{{to}}: {{reply}}', { to: w.to, reply: w.reply })
                : t('relays.q.notTried', '{{to}}: not tried yet', { to: w.to })}
            </p>
          ))}
        </div>
        {canChange && message.state !== 'claimed' && (
          <Button variant="outline" size="sm" onClick={onDestroy}>
            <Trash2 className="mr-2 h-4 w-4" />
            {inbound ? t('relays.q.discard', 'Discard…') : t('relays.q.cancel', 'Cancel…')}
          </Button>
        )}
      </div>
    </li>
  );
}

function DestroyDialog({
  message,
  onClose,
  onDone,
}: {
  message: RelayMessage;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const inbound = message.direction === 'inbound';
  const run = async () => {
    setBusy(true);
    try {
      await destroyRelayMessage(message.id, reason);
      toast({ title: inbound ? t('relays.q.discarded', 'Discarded') : t('relays.q.cancelled', 'Cancelled') });
      onDone();
    } catch (e) {
      failed(t('relays.q.destroyFailed', 'Nothing was changed'), e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {inbound
              ? t('relays.q.discardTitle', 'Discard this message?')
              : t('relays.q.cancelTitle', 'Cancel this message?')}
          </DialogTitle>
          <DialogDescription>
            {inbound
              ? t(
                  'relays.q.discardBody',
                  'It’s deleted at the relay and never reaches anyone here. The sender isn’t told.',
                )
              : t(
                  'relays.q.cancelBody',
                  'It isn’t delivered to the recipients still waiting, and the sender isn’t told. If the relay is sending it right now, it stops after this attempt.',
                )}
          </DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('relays.q.reason', 'Reason, for the audit log')}</span>
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('relays.keep', 'Keep it')}
          </Button>
          <Button variant="destructive" onClick={() => void run()} disabled={busy || !reason.trim()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {inbound ? t('relays.q.discardGo', 'Discard') : t('relays.q.cancelGo', 'Cancel it')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QueueDialog({ relay, onClose }: { relay: Relay; onClose: () => void }) {
  const { t } = useTranslation();
  const canChange = useAccountStore((s) => s.hasPermission('sysRelayQueueUpdate'));
  const [messages, setMessages] = useState<RelayMessage[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [fetches, setFetches] = useState(0);
  const [destroying, setDestroying] = useState<RelayMessage | null>(null);
  const reread = () => {
    setProblem(null);
    setMessages(null);
    setFetches((n) => n + 1);
  };
  useEffect(() => {
    const controller = new AbortController();
    fetchRelayMessages(relay.id, controller.signal)
      .then((list) => !controller.signal.aborted && setMessages(list))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setProblem(
          e instanceof RelayUnreachable
            ? t('relays.q.unreachable', 'This server can’t reach the relay right now.')
            : errorText(e),
        );
      });
    return () => controller.abort();
  }, [relay.id, fetches, t]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('relays.q.title', 'Waiting at {{name}}', { name: relay.name })}</DialogTitle>
          <DialogDescription>
            {t(
              'relays.q.body',
              'Read from the relay just now. Mail coming in waits there while this server can’t take it; mail going out waits for the other side.',
            )}
          </DialogDescription>
        </DialogHeader>
        {problem ? (
          <p className="text-sm text-destructive">{problem}</p>
        ) : messages === null ? (
          <LoadingFallback />
        ) : messages.length === 0 ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            {t('relays.q.none', 'Nothing is waiting.')}
          </p>
        ) : (
          <ul className="space-y-2">
            {messages.map((m) => (
              <MessageLine key={m.id} message={m} canChange={canChange} onDestroy={() => setDestroying(m)} />
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={reread}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t('relays.q.refresh', 'Read again')}
          </Button>
          <Button onClick={onClose}>{t('relays.close', 'Close')}</Button>
        </DialogFooter>
        {destroying && (
          <DestroyDialog
            message={destroying}
            onClose={() => setDestroying(null)}
            onDone={() => {
              setDestroying(null);
              reread();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmDialog({
  title,
  body,
  action,
  destructive,
  onClose,
  onConfirm,
}: {
  title: string;
  body: string;
  action: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('relays.reason', 'Reason, for the audit log (optional)')}</span>
          <Input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('relays.cancel', 'Cancel')}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void onConfirm(reason).finally(() => setBusy(false));
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {action}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RelayCard({
  relay,
  canChange,
  canSeeQueue,
  onSettings,
  onQueue,
  onRejoin,
  onDelete,
}: {
  relay: Relay;
  canChange: boolean;
  canSeeQueue: boolean;
  onSettings: () => void;
  onQueue: () => void;
  onRejoin: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const notes = attention(relay);
  const status = latestStatus(relay);
  const linked = relay.links.filter((l) => l.state === 'linked').length;
  return (
    <section className="space-y-3 rounded-xl border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {relay.name}
            {!relay.enabled && <Badge variant="secondary">{t('relays.b.off', 'Off')}</Badge>}
            {relay.enabled && relay.joinState === 'joined' && relay.links.length > 0 && (
              <Badge variant="outline">
                {t('relays.b.linked', 'Linked on {{linked}} of {{nodes}} nodes', {
                  linked,
                  nodes: relay.links.length,
                })}
              </Badge>
            )}
            {relay.sendThrough && (
              <Badge variant="outline">
                <Send className="mr-1 h-3 w-3" />
                {t('relays.b.sendThrough', 'Sends all mail')}
              </Badge>
            )}
            {relay.inboundOnly && <Badge variant="outline">{t('relays.b.inboundOnly', 'Takes mail in only')}</Badge>}
          </p>
          <p className="text-sm text-muted-foreground">
            {relay.settings.hostname || t('relays.noHostname', 'no public name yet')}
            {' · '}
            {t('relays.linkAt', 'link at {{address}}:{{port}}', { address: relay.address, port: relay.linkPort })}
          </p>
          {status && (
            <p className="text-xs text-muted-foreground">
              {t('relays.status', 'Version {{version}} · {{mode}} · {{inbound}} in, {{outbound}} out ({{bytes}})', {
                version: status.relayVersion,
                mode:
                  status.mode === 'live'
                    ? t('relays.mode.live', 'live')
                    : status.mode === 'held'
                      ? t('relays.mode.held', 'holding mail')
                      : t('relays.mode.unconfigured', 'not set up'),
                inbound: status.spool.inbound,
                outbound: status.spool.outbound,
                bytes: formatSize(status.spool.bytes),
              })}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onSettings}>
            <Settings2 className="mr-2 h-4 w-4" />
            {t('relays.settings', 'Settings…')}
          </Button>
          {canSeeQueue && relay.joinState === 'joined' && (
            <Button variant="outline" size="sm" onClick={onQueue}>
              <Inbox className="mr-2 h-4 w-4" />
              {t('relays.queue', 'Queue…')}
            </Button>
          )}
          {canChange && (
            <>
              <Button variant="ghost" size="sm" onClick={onRejoin}>
                <RefreshCw className="mr-2 h-4 w-4" />
                {t('relays.rejoin', 'New join…')}
              </Button>
              <Button variant="ghost" size="sm" onClick={onDelete} aria-label={t('relays.delete', 'Remove…')}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>
      {notes.length > 0 && (
        <ul className="space-y-1">
          {notes.map((a, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span className="break-words">{attentionText(t, a)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Open =
  | { kind: 'add' }
  | { kind: 'token'; name: string; token: string }
  | { kind: 'settings'; relay: Relay }
  | { kind: 'queue'; relay: Relay }
  | { kind: 'rejoin'; relay: Relay }
  | { kind: 'delete'; relay: Relay };

export function RelaysPage() {
  const { t } = useTranslation();
  const canChange = useAccountStore((s) => s.hasPermission('sysRelayUpdate'));
  const canSeeQueue = useAccountStore((s) => s.hasPermission('sysRelayQueueGet'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [open, setOpen] = useState<Open | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRelays(controller.signal)
      .then((relays) => !controller.signal.aborted && setLoad({ kind: 'ready', relays }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof RelaysUnavailable
              ? t('relays.unavailable', 'This server doesn’t link to relays.')
              : errorText(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  const close = () => setOpen(null);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="route"
        title={t('relays.title', 'Relays')}
        subtitle={t(
          'relays.subtitle',
          'Small edge servers that take mail in on port 25 for this server, and can send its mail out. Only this server talks to them.',
        )}
        actions={
          canChange && (
            <Button onClick={() => setOpen({ kind: 'add' })}>
              <Plus className="mr-2 h-4 w-4" />
              {t('relays.add', 'Add a relay…')}
            </Button>
          )
        }
      />
      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && load.relays.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('relays.none', 'No relays. Mail comes straight to this server and leaves from it.')}
        </div>
      )}
      {load.kind === 'ready' &&
        load.relays.map((relay) => (
          <RelayCard
            key={relay.id}
            relay={relay}
            canChange={canChange}
            canSeeQueue={canSeeQueue}
            onSettings={() => setOpen({ kind: 'settings', relay })}
            onQueue={() => setOpen({ kind: 'queue', relay })}
            onRejoin={() => setOpen({ kind: 'rejoin', relay })}
            onDelete={() => setOpen({ kind: 'delete', relay })}
          />
        ))}

      {open?.kind === 'add' && (
        <AddDialog
          onClose={close}
          onAdded={(name, token) => {
            setOpen({ kind: 'token', name, token });
            refetch();
          }}
        />
      )}
      {open?.kind === 'token' && <TokenDialog name={open.name} token={open.token} onClose={close} />}
      {open?.kind === 'settings' && (
        <SettingsDialog
          relay={open.relay}
          canChange={canChange}
          onClose={close}
          onSaved={() => {
            close();
            refetch();
          }}
        />
      )}
      {open?.kind === 'queue' && <QueueDialog relay={open.relay} onClose={close} />}
      {open?.kind === 'rejoin' && (
        <ConfirmDialog
          title={t('relays.rejoinTitle', 'Start a new join for {{name}}?', { name: open.relay.name })}
          body={t(
            'relays.rejoinBody',
            'For a relay that was reset or reinstalled. Its link stops until it joins again with the new token.',
          )}
          action={t('relays.rejoinGo', 'Start a new join')}
          onClose={close}
          onConfirm={async (reason) => {
            try {
              const token = await rejoinRelay(open.relay.id, reason);
              setOpen({ kind: 'token', name: open.relay.name, token });
              refetch();
            } catch (e) {
              failed(t('relays.rejoinFailed', 'No new join was started'), e);
            }
          }}
        />
      )}
      {open?.kind === 'delete' && (
        <ConfirmDialog
          title={t('relays.deleteTitle', 'Remove {{name}}?', { name: open.relay.name })}
          body={t(
            'relays.deleteBody',
            'The link ends and the relay closes port 25. Mail it still holds stays there; to keep it, turn the relay off instead.',
          )}
          action={t('relays.deleteGo', 'Remove')}
          destructive
          onClose={close}
          onConfirm={async (reason) => {
            try {
              await deleteRelay(open.relay.id, reason);
              close();
              refetch();
            } catch (e) {
              failed(t('relays.deleteFailed', 'The relay wasn’t removed'), e);
            }
          }}
        />
      )}
    </div>
  );
}
