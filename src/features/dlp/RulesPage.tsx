/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Data loss prevention, and Settings ›
 * Mail flow › Rules (dlp-and-mail-flow-rules spec, §3): the rules of one
 * kind, in the order they run, each in words; new, change, switch off,
 * delete, with the kind's own permissions.
 */

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { useAccountStore } from '@/stores/accountStore';
import { toast } from '@/hooks/use-toast';
import { deleteRule, fetchRules, RulesUnavailable, setRuleEnabled } from './api';
import { describeRule, newRule, type Kind, type Rule } from './model';
import { RuleEditor } from './RuleEditor';

type Load = { kind: 'loading' } | { kind: 'ready'; rules: Rule[] } | { kind: 'error'; message: string };

function RulesPage({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const dlp = kind === 'dlp';
  const canChange = useAccountStore((s) => s.hasPermission(dlp ? 'sysDlpPolicyUpdate' : 'sysMailRuleUpdate'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [editing, setEditing] = useState<Rule | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const refetch = useCallback(() => setFetches((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    fetchRules(kind, controller.signal)
      .then((rules) => !controller.signal.aborted && setLoad({ kind: 'ready', rules }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof RulesUnavailable
              ? t('rules.unavailable', 'This server doesn’t have mail rules.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [kind, fetches, t]);

  const act = async (work: () => Promise<void>) => {
    try {
      await work();
      refetch();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('rules.notSaved', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader
        icon={dlp ? 'shield-alert' : 'route'}
        title={dlp ? t('rules.dlpTitle', 'Data loss prevention') : t('rules.flowTitle', 'Mail flow rules')}
        subtitle={
          dlp
            ? t(
                'rules.dlpSubtitle',
                'Rules that check outgoing mail for what shouldn’t leave (card numbers, national ID numbers, keys, your own words) and warn, hold it for review, or block it. Every match is in the audit log, never what was found.',
              )
            : t(
                'rules.flowSubtitle',
                'Rules that change mail as it passes: disclaimers, banners, headers, copies, redirects, refusals. They run after the server’s own Sieve script, in the order below.',
              )
        }
        actions={
          canChange && (
            <Button onClick={() => setEditing(newRule(kind))}>
              <Plus className="mr-2 h-4 w-4" />
              {t('rules.new', 'New rule…')}
            </Button>
          )
        }
      />
      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}
      {load.kind === 'ready' && load.rules.length === 0 && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          {dlp
            ? t('rules.noneDlp', 'No DLP rules yet: outgoing mail isn’t checked.')
            : t('rules.noneFlow', 'No mail flow rules yet.')}
        </div>
      )}
      {load.kind === 'ready' &&
        load.rules.map((rule) => (
          <section key={rule.id} className={`space-y-2 rounded-xl border p-4 ${rule.enabled ? '' : 'opacity-60'}`}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="font-medium">
                  <span className="mr-2 text-xs tabular-nums text-muted-foreground">{rule.priority}</span>
                  {rule.name}
                </p>
                <p className="text-sm">{describeRule(rule)}</p>
                {rule.description && <p className="text-xs text-muted-foreground">{rule.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={rule.enabled}
                  disabled={!canChange}
                  onCheckedChange={(on) => void act(() => setRuleEnabled(rule, on))}
                  aria-label={t('rules.enabled', 'On')}
                />
                {canChange && (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(rule)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      {t('rules.edit', 'Change…')}
                    </Button>
                    {confirming === rule.id ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                          setConfirming(null);
                          if (rule.id) void act(() => deleteRule(rule.id as string));
                        }}
                      >
                        {t('rules.deleteConfirm', 'Delete it')}
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirming(rule.id ?? null)}
                        aria-label={t('rules.delete', 'Delete')}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        ))}
      {editing && (
        <RuleEditor
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            refetch();
          }}
        />
      )}
    </div>
  );
}

export function DlpRulesPage() {
  return <RulesPage kind="dlp" />;
}

export function MailFlowRulesPage() {
  return <RulesPage kind="transport" />;
}
