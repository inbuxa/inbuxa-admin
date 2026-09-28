/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: at the top of Spam filter › General, how hard the filter is as
 * one choice, and the few switches that matter (settings-reorg, first
 * wave). The form below stays for anything finer.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LEVEL_THRESHOLDS, LEVELS, levelOf, outcomes, type Level, type Thresholds } from './levels';

interface State {
  thresholds: Thresholds;
  enable: boolean;
  trustContacts: boolean;
  trustReplies: boolean;
  pyzor: boolean | null;
}

async function load(): Promise<State> {
  const res = await jmapRequest([
    [
      'x:SpamSettings/get',
      {
        accountId: getAccountId('x:SpamSettings'),
        ids: ['singleton'],
        properties: ['scoreSpam', 'scoreReject', 'scoreDiscard', 'enable', 'trustContacts', 'trustReplies'],
      },
      's',
    ],
    ['x:SpamPyzor/get', { accountId: getAccountId('x:SpamPyzor'), ids: ['singleton'], properties: ['enable'] }, 'p'],
  ]);
  const one = (id: string) =>
    ((res.find(([name, , i]) => i === id && name !== 'error')?.[1] as { list?: Record<string, unknown>[] } | undefined)
      ?.list ?? [])[0];
  const s = one('s') ?? {};
  const p = one('p');
  return {
    thresholds: {
      scoreSpam: Number(s.scoreSpam ?? 5),
      scoreReject: Number(s.scoreReject ?? 0),
      scoreDiscard: Number(s.scoreDiscard ?? 0),
    },
    enable: s.enable !== false,
    trustContacts: s.trustContacts !== false,
    trustReplies: s.trustReplies !== false,
    pyzor: p ? p.enable !== false : null,
  };
}

export function SpamLevels({ onApplied }: { onApplied?: () => void }) {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysSpamSettings', 'Update'));
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const [saved, setSaved] = useState<State | null>(null);
  const [draft, setDraft] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    load()
      .then((s) => {
        if (!live) return;
        setSaved(s);
        setDraft(s);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  if (!saved || !draft) return null;

  const current = levelOf(saved.thresholds);
  const picked = levelOf(draft.thresholds);
  const changed =
    JSON.stringify(draft.thresholds) !== JSON.stringify(saved.thresholds) ||
    draft.enable !== saved.enable ||
    draft.trustContacts !== saved.trustContacts ||
    draft.trustReplies !== saved.trustReplies ||
    draft.pyzor !== saved.pyzor;

  const label: Record<Level, string> = {
    relaxed: t('spamLevels.relaxed', 'Relaxed'),
    balanced: t('spamLevels.balanced', 'Balanced'),
    strict: t('spamLevels.strict', 'Strict'),
  };
  const hint: Record<Level, string> = {
    relaxed: t(
      'spamLevels.relaxedHint',
      'Only clear spam goes to Junk. Some spam reaches the inbox; almost nothing real is misfiled.',
    ),
    balanced: t('spamLevels.balancedHint', 'The server’s stock setting. Likely spam goes to Junk; nothing is refused.'),
    strict: t(
      'spamLevels.strictHint',
      'More goes to Junk, and blatant spam is refused outright. The sender of a misjudged message gets a bounce.',
    ),
  };
  const link = (view: string, text: string) => (
    <Link className="text-primary hover:underline" to={`/${viewToSection[view] ?? 'Settings'}/${view}`}>
      {text}
    </Link>
  );

  const save = async () => {
    setBusy(true);
    try {
      const calls: [string, Record<string, unknown>, string][] = [];
      const patch: Record<string, unknown> = {};
      if (JSON.stringify(draft.thresholds) !== JSON.stringify(saved.thresholds)) Object.assign(patch, draft.thresholds);
      if (draft.enable !== saved.enable) patch.enable = draft.enable;
      if (draft.trustContacts !== saved.trustContacts) patch.trustContacts = draft.trustContacts;
      if (draft.trustReplies !== saved.trustReplies) patch.trustReplies = draft.trustReplies;
      if (Object.keys(patch).length > 0) {
        calls.push([
          'x:SpamSettings/set',
          { accountId: getAccountId('x:SpamSettings'), update: { singleton: patch } },
          's',
        ]);
      }
      if (draft.pyzor !== saved.pyzor && draft.pyzor !== null) {
        calls.push([
          'x:SpamPyzor/set',
          { accountId: getAccountId('x:SpamPyzor'), update: { singleton: { enable: draft.pyzor } } },
          'p',
        ]);
      }
      const responses = await jmapRequest(calls);
      const failed = responses
        .map(([, body]) => (body as unknown as JmapSetResponse).notUpdated?.singleton)
        .filter(Boolean)
        .map((e) => e!.description ?? e!.type);
      if (failed.length > 0) throw new Error(failed.join('; '));
      const fresh = await load();
      setSaved(fresh);
      setDraft(fresh);
      onApplied?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('spamLevels.failed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const toggle = (key: 'enable' | 'trustContacts' | 'trustReplies' | 'pyzor', text: string, sub?: string) => (
    <label className="flex items-start justify-between gap-4 py-2 text-sm">
      <span>
        {text}
        {sub && <span className="block text-xs text-muted-foreground">{sub}</span>}
      </span>
      <Switch
        checked={Boolean(draft[key])}
        disabled={!canUpdate}
        onCheckedChange={(v) => setDraft((d) => (d ? { ...d, [key]: v } : d))}
      />
    </label>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldAlert className="h-5 w-5 text-primary" />
        <p className="flex-1 font-medium">{t('spamLevels.title', 'How hard the spam filter is')}</p>
        {current === null && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('spamLevels.byHand', 'Thresholds set by hand below')}
          </span>
        )}
        {changed && (
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !canUpdate}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('spamLevels.save', 'Save changes')}
          </Button>
        )}
      </div>

      {toggle('enable', t('spamLevels.enable', 'Filter incoming mail for spam'))}

      {draft.enable && (
        <>
          <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
            {LEVELS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={picked === l}
                disabled={!canUpdate}
                onClick={() => setDraft((d) => (d ? { ...d, thresholds: { ...LEVEL_THRESHOLDS[l] } } : d))}
                className={cn(
                  'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/60',
                  picked === l ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-background',
                )}
              >
                <span className="flex w-full items-center gap-2 text-sm font-medium">
                  {label[l]}
                  {current === l && (
                    <span className="ml-auto text-xs font-normal text-muted-foreground">
                      {t('spamLevels.now', 'Current')}
                    </span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground">{hint[l]}</span>
              </button>
            ))}
          </div>
          <ul className="space-y-0.5 text-sm">
            {outcomes(draft.thresholds).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {draft.thresholds.scoreDiscard > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t(
                'spamLevels.discardWarning',
                'A discard threshold is set by hand. Picking a level turns it off: deleted mail can’t be found again, and nobody is told.',
              )}
            </p>
          )}

          <div className="divide-y border-t">
            {toggle(
              'trustReplies',
              t('spamLevels.trustReplies', 'Never treat replies to people’s own messages as spam'),
            )}
            {toggle(
              'trustContacts',
              t('spamLevels.trustContacts', 'Never treat mail from people in their address book as spam'),
            )}
            {draft.pyzor !== null &&
              toggle(
                'pyzor',
                t('spamLevels.pyzor', 'Check messages against Pyzor’s shared spam list'),
                t(
                  'spamLevels.pyzorHint',
                  'Sends a fingerprint of each message, not the message itself, to public.pyzor.org.',
                ),
              )}
          </div>

          <p className="text-xs text-muted-foreground">
            {t('spamLevels.more', 'More:')} {link('CustomComponent/LocalAi', t('spamLevels.localAi', 'Local AI'))}
            {' · '}
            {link('x:SpamDnsblServer', t('spamLevels.blocklists', 'Blocklists'))}
            {' · '}
            {link('x:SpamTag', t('spamLevels.scores', 'Scores'))}
            {' · '}
            {link('x:MemoryLookupKey/SpamTrustedDomain', t('spamLevels.trusted', 'Trusted domains'))}
          </p>
        </>
      )}
    </div>
  );
}
