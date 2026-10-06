/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: at the top of Mail flow › Receiving › Sender checks, the six
 * checks as one choice of level, with a table of what each level does to
 * mail that fails (settings-reorg, first wave). The form below stays for
 * anything finer; setting values by hand shows as "Set by hand".
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getAccountId, jmapGet, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import type { JmapSetResponse } from '@/types/jmap';
import { cn } from '@/lib/utils';
import { CHECKS, currentLevel, LEVELS, levelValues, modeOf, type Check, type Level } from './levels';

const OBJECT = 'x:SenderAuth';

export function SenderChecksLevels({ onApplied }: { onApplied: () => void }) {
  const { t } = useTranslation();
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysSenderAuth', 'Update'));
  const [current, setCurrent] = useState<Level | null | undefined>(undefined);
  const [picked, setPicked] = useState<Level | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let live = true;
    jmapGet(OBJECT, getAccountId(OBJECT), ['singleton'], [...CHECKS, 'dkimStrict'])
      .then(([res]) => {
        const data = ((res?.[1] as { list?: Record<string, unknown>[] })?.list ?? [])[0];
        if (!live || !data) return;
        const level = currentLevel(data);
        setCurrent(level);
        setPicked(level ?? 'recommended');
      })
      .catch(() => live && setCurrent(null));
    return () => {
      live = false;
    };
  }, [version]);

  const label: Record<Level, string> = {
    relaxed: t('senderLevels.relaxed', 'Relaxed'),
    recommended: t('senderLevels.recommended', 'Recommended'),
    strict: t('senderLevels.strict', 'Strict'),
  };
  const hint: Record<Level, string> = {
    relaxed: t(
      'senderLevels.relaxedHint',
      'Checks everything and hands the results to the spam filter, but refuses nothing. The server’s stock setting.',
    ),
    recommended: t(
      'senderLevels.recommendedHint',
      'Also refuses mail forged in the name of a domain that asks for that (DMARC p=reject), and checks forwarding chains (ARC).',
    ),
    strict: t(
      'senderLevels.strictHint',
      'Also refuses senders without matching reverse DNS or a passing SPF record. Expect to lose some real mail from small or badly set-up servers.',
    ),
  };
  const checkName: Record<Check, string> = {
    spfEhloVerify: t('senderLevels.spfEhlo', 'Sending server’s name (SPF on EHLO)'),
    spfFromVerify: t('senderLevels.spfFrom', 'Envelope sender (SPF on MAIL FROM)'),
    dkimVerify: t('senderLevels.dkim', 'Signatures (DKIM)'),
    dmarcVerify: t('senderLevels.dmarc', 'Sender domain’s policy (DMARC)'),
    arcVerify: t('senderLevels.arc', 'Forwarding chain (ARC)'),
    reverseIpVerify: t('senderLevels.iprev', 'Reverse DNS of the sending server'),
  };
  const cell = (level: Level, check: Check) => {
    const mode = modeOf(level, check);
    if (mode === 'disable') return { text: t('senderLevels.off', 'Not checked'), tone: 'muted' };
    if (mode === 'relaxed') return { text: t('senderLevels.checked', 'Checked, scored'), tone: 'plain' };
    if (check === 'dmarcVerify')
      return { text: t('senderLevels.dmarcReject', 'Refused if the domain says reject'), tone: 'strong' };
    return { text: t('senderLevels.refused', 'Failures refused'), tone: 'warn' };
  };

  const apply = async () => {
    if (!picked) return;
    setBusy(true);
    setError(null);
    try {
      const [res] = await jmapSet(OBJECT, getAccountId(OBJECT), { update: { singleton: levelValues(picked) } });
      const body = res?.[1] as unknown as JmapSetResponse | undefined;
      const bad = body?.notUpdated?.singleton;
      if (bad || !body?.updated || !('singleton' in body.updated)) {
        throw new Error(bad?.description ?? bad?.type ?? t('senderLevels.failed', 'The level could not be saved.'));
      }
      setVersion((v) => v + 1);
      onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (current === undefined) return null;

  return (
    <div className="mx-auto max-w-4xl space-y-4 rounded-xl border bg-card p-5">
      <div className="flex flex-wrap items-center gap-3">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <p className="font-medium">{t('senderLevels.title', 'How strict to be with incoming mail')}</p>
        {current === null && (
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {t('senderLevels.byHand', 'Set by hand below')}
          </span>
        )}
      </div>

      <div className="grid gap-2 sm:grid-cols-3" role="radiogroup">
        {LEVELS.map((l) => (
          <button
            key={l}
            type="button"
            role="radio"
            aria-checked={picked === l}
            disabled={!canUpdate}
            onClick={() => setPicked(l)}
            className={cn(
              'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors hover:border-primary/60',
              picked === l ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'bg-background',
            )}
          >
            <span className="flex w-full items-center gap-2 text-sm font-medium">
              {label[l]}
              {current === l && (
                <span className="ml-auto text-xs font-normal text-muted-foreground">
                  {t('senderLevels.now', 'Current')}
                </span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{hint[l]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1.5 pr-3 font-medium">{t('senderLevels.check', 'Check')}</th>
              {LEVELS.map((l) => (
                <th key={l} className={cn('py-1.5 pr-3 font-medium', picked === l && 'text-foreground')}>
                  {label[l]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {CHECKS.map((c) => (
              <tr key={c}>
                <td className="py-1.5 pr-3">{checkName[c]}</td>
                {LEVELS.map((l) => {
                  const v = cell(l, c);
                  return (
                    <td
                      key={l}
                      className={cn(
                        'py-1.5 pr-3',
                        v.tone === 'muted' && 'text-muted-foreground',
                        v.tone === 'warn' && 'text-amber-600 dark:text-amber-400',
                        v.tone === 'strong' && 'font-medium',
                        picked !== l && 'opacity-60',
                      )}
                    >
                      {v.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {t(
          'senderLevels.footnote',
          'Checks run on port 25, where other servers deliver; mail from your own signed-in users isn’t checked. No level refuses unsigned mail: most legitimate mail would bounce.',
        )}
      </p>

      {canUpdate && picked && picked !== current && (
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {current === null && (
            <p className="flex flex-1 items-start gap-2 text-sm text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              {t(
                'senderLevels.replaces',
                'This replaces the six checks below, including any conditions you added to them. DKIM signing isn’t touched.',
              )}
            </p>
          )}
          <Button type="button" className="ml-auto" onClick={() => void apply()} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('senderLevels.apply', 'Use {{level}}', { level: label[picked] })}
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
