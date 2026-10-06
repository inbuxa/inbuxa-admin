/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Held mail (dlp-and-mail-flow-rules
 * spec, §2.6): outgoing mail a DLP rule held, waiting for a reviewer to
 * release or reject it. Reading one is recorded as access to the sender's
 * mail; every decision needs a reason for the audit log.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Loader2, Send, Undo2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
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
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { formatSize } from '@/features/hold/legalHold';
import { Input } from '@/components/ui/input';
import {
  decideHeld,
  fetchHeld,
  fetchKeepHeldDays,
  fetchPreview,
  RulesUnavailable,
  saveKeepHeldDays,
  type HeldMessage,
} from './api';
import { detectorName } from './model';

type Load = { kind: 'loading' } | { kind: 'ready'; held: HeldMessage[] } | { kind: 'error'; message: string };

function when(iso: string): string {
  return iso ? new Date(iso).toLocaleString() : '';
}

function ReadDialog({ message, onClose }: { message: HeldMessage; onClose: () => void }) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    fetchPreview(message.id)
      .then(setText)
      .catch((e: unknown) => setFailed(e instanceof Error ? e.message : String(e)));
  }, [message.id]);
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{message.subject || t('held.noSubject', '(no subject)')}</DialogTitle>
          <DialogDescription>
            {t('held.readRecorded', 'From {{sender}}. Reading it is recorded in the audit log.', {
              sender: message.sender,
            })}
          </DialogDescription>
        </DialogHeader>
        {failed ? (
          <p className="text-sm text-destructive">{failed}</p>
        ) : text === null ? (
          <LoadingFallback />
        ) : (
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-md border bg-muted/40 p-3 text-sm">
            {text}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DecideDialog({
  message,
  decision,
  onClose,
  onDone,
}: {
  message: HeldMessage;
  decision: 'release' | 'reject';
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const release = decision === 'release';

  const run = async () => {
    setBusy(true);
    try {
      await decideHeld(message.id, decision, reason, note);
      toast({
        title: release
          ? t('held.released', 'Released: it’s on its way')
          : t('held.rejected', 'Rejected: the sender was told'),
      });
      onDone();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('held.decideFailed', 'Nothing was changed'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {release
              ? t('held.releaseTitle', 'Release “{{subject}}”', { subject: message.subject })
              : t('held.rejectTitle', 'Reject “{{subject}}”', { subject: message.subject })}
          </DialogTitle>
          <DialogDescription>
            {release
              ? t('held.releaseBody', 'It will be delivered to {{to}} as it was sent.', {
                  to: message.recipients.join(', '),
                })
              : t('held.rejectBody', 'It’s taken out of the queue, and {{sender}} is told it wasn’t sent.', {
                  sender: message.sender,
                })}
          </DialogDescription>
        </DialogHeader>
        {!release && (
          <label className="block space-y-1 text-sm">
            <span className="text-muted-foreground">{t('held.note', 'A note for the sender (optional)')}</span>
            <Textarea value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="text-muted-foreground">{t('held.reason', 'Reason, for the audit log')}</span>
          <Textarea value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} />
        </label>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('held.cancel', 'Cancel')}
          </Button>
          <Button
            variant={release ? 'default' : 'destructive'}
            onClick={() => void run()}
            disabled={busy || !reason.trim()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : release ? (
              <Send className="mr-2 h-4 w-4" />
            ) : (
              <Undo2 className="mr-2 h-4 w-4" />
            )}
            {release ? t('held.releaseGo', 'Release') : t('held.rejectGo', 'Reject')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** How long held mail waits, and changing it for those who may. */
function KeepDays() {
  const { t } = useTranslation();
  const canChange = useAccountStore((s) => s.hasPermission('sysDlpPolicyUpdate'));
  const [days, setDays] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('7');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetchKeepHeldDays(controller.signal)
      .then((d) => !controller.signal.aborted && setDays(d))
      // An older server, or no permission to see it: say nothing
      .catch(() => {});
    return () => controller.abort();
  }, []);
  if (days === null) return null;
  const valid = /^\d+$/.test(value) && Number(value) >= 1 && Number(value) <= 90;
  const save = async () => {
    setBusy(true);
    try {
      await saveKeepHeldDays(Number(value));
      setDays(Number(value));
      setEditing(false);
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('held.daysFailed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      {editing ? (
        <>
          <span>{t('held.daysLabel', 'Held mail waits')}</span>
          <Input
            type="number"
            min={1}
            max={90}
            className="h-8 w-20"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span>{t('held.daysUnit', 'days (1 to 90) for newly held mail')}</span>
          <Button size="sm" disabled={busy || !valid} onClick={() => void save()}>
            {t('held.save', 'Save')}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            {t('held.cancel', 'Cancel')}
          </Button>
        </>
      ) : (
        <>
          <span>
            {t('held.days', {
              count: days,
              defaultValue_one: 'If nobody decides within 1 day, it goes back to the sender.',
              defaultValue_other: 'If nobody decides within {{count}} days, it goes back to the sender.',
            })}
          </span>
          {canChange && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setValue(String(days));
                setEditing(true);
              }}
            >
              {t('held.changeDays', 'Change…')}
            </Button>
          )}
        </>
      )}
    </div>
  );
}

export function HeldMailPage() {
  const { t } = useTranslation();
  const canDecide = useAccountStore((s) => s.hasPermission('sysDlpReviewUpdate'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [reading, setReading] = useState<HeldMessage | null>(null);
  const [deciding, setDeciding] = useState<{ message: HeldMessage; decision: 'release' | 'reject' } | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchHeld(controller.signal)
      .then((held) => !controller.signal.aborted && setLoad({ kind: 'ready', held }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof RulesUnavailable
              ? t('held.unavailable', 'This server doesn’t hold mail for review.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon="shield-alert"
        title={t('held.title', 'Held mail')}
        subtitle={t(
          'held.subtitle',
          'Outgoing mail a DLP rule held for review. Release it and it’s delivered; reject it and the sender is told.',
        )}
      />
      <KeepDays />
      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && load.held.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {t('held.none', 'Nothing is waiting for review.')}
        </div>
      )}
      {load.kind === 'ready' &&
        load.held.map((message) => (
          <section key={message.id} className="space-y-3 rounded-xl border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">{message.subject || t('held.noSubject', '(no subject)')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('held.fromTo', '{{sender}} to {{to}}', {
                    sender: message.sender,
                    to: message.recipients.join(', '),
                  })}
                  {' · '}
                  {formatSize(message.size)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('held.when', 'Held {{held}}; goes back to the sender {{expires}} if nobody decides', {
                    held: when(message.heldAt),
                    expires: when(message.expiresAt),
                  })}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setReading(message)}>
                  <Eye className="mr-2 h-4 w-4" />
                  {t('held.read', 'Read…')}
                </Button>
                {canDecide && (
                  <>
                    <Button size="sm" onClick={() => setDeciding({ message, decision: 'release' })}>
                      {t('held.releaseAction', 'Release…')}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setDeciding({ message, decision: 'reject' })}>
                      {t('held.rejectAction', 'Reject…')}
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {message.rules.map((rule) => (
                <Badge key={rule.name} variant="secondary" title={rule.notice}>
                  {rule.name}
                </Badge>
              ))}
              {message.counts
                .filter((c) => c.count > 0)
                .map((c) => (
                  <Badge key={c.detector} variant="outline">
                    {c.detector === 'words'
                      ? t('held.words', 'Words')
                      : c.detector === 'pattern'
                        ? t('held.pattern', 'Pattern')
                        : detectorName(c.detector)}
                    {': '}
                    {c.count}
                  </Badge>
                ))}
            </div>
          </section>
        ))}
      {reading && <ReadDialog message={reading} onClose={() => setReading(null)} />}
      {deciding && (
        <DecideDialog
          message={deciding.message}
          decision={deciding.decision}
          onClose={() => setDeciding(null)}
          onDone={() => {
            setDeciding(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}
