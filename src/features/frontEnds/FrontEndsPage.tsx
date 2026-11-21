/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Settings › Network › Web › Front ends. Where inbuxa Admin and the
 * webmail are served (`inbuxa:FrontEnds`, contract C-4), the same thing
 * `inbuxa join` sets from the installer. Saving registers their sign-in and
 * rebuilds the cross-origin allowlist on every node.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router-dom';
import { Check, Copy, KeyRound, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { toast } from '@/hooks/use-toast';
import { getApiBaseUrl } from '@/services/api';
import { useAccountStore } from '@/stores/accountStore';
import { fetchFrontEnds, FrontEndsUnavailable, saveFrontEnds } from './api';
import {
  cutsOffThisConsole,
  draftOf,
  draftProblem,
  MIN_SECRET_LENGTH,
  newSecret,
  originProblem,
  patchOf,
  urlProblem,
  type Draft,
  type FrontEnds,
} from './model';

type Load = { kind: 'loading' } | { kind: 'ready'; current: FrontEnds } | { kind: 'error'; message: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function Section({ title, hint, children }: { title: string; hint: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <div>
        <h2 className="font-medium">{title}</h2>
        <p className="text-sm text-muted-foreground">{hint}</p>
      </div>
      {children}
    </section>
  );
}

/** What this node's environment says beside the stored value; both are used. */
function FromEnvironment({ name, value }: { name: string; value: string }) {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-muted-foreground">
      {t('frontEnds.fromEnvironment', 'Also {{value}}, from {{name}} on the node that answered. Both are used.', {
        value,
        name,
      })}
    </p>
  );
}

function CopyButton({ text }: { text: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      {done ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
      {done ? t('frontEnds.copied', 'Copied') : t('frontEnds.copy', 'Copy')}
    </Button>
  );
}

export function FrontEndsPage() {
  const { t } = useTranslation();
  // Reading takes the HTTP settings' permission; changing it registers OAuth clients too.
  const canSave = useAccountStore((s) => s.hasPermission('sysHttpUpdate') && s.hasPermission('sysOAuthClientUpdate'));
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [fetches, setFetches] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newOrigin, setNewOrigin] = useState('');
  const [originError, setOriginError] = useState<string | null>(null);
  const [cutOffOk, setCutOffOk] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchFrontEnds(controller.signal)
      .then((current) => {
        if (controller.signal.aborted) return;
        setLoad({ kind: 'ready', current });
        setDraft(draftOf(current));
        setNewOrigin('');
        setOriginError(null);
        setCutOffOk(false);
      })
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof FrontEndsUnavailable
              ? t('frontEnds.unavailable', 'This server doesn’t keep its front ends’ addresses. Use its environment.')
              : message(e),
        });
      });
    return () => controller.abort();
  }, [fetches, t]);

  const current = load.kind === 'ready' ? load.current : null;
  // An origin typed but not yet added counts: it's saved with the rest.
  const effective = useMemo(() => {
    if (!draft) return null;
    const typed = newOrigin.trim();
    return typed && !originProblem(typed, draft.extraOrigins)
      ? { ...draft, extraOrigins: [...draft.extraOrigins, typed] }
      : draft;
  }, [draft, newOrigin]);
  const patch = useMemo(() => (effective && current ? patchOf(effective, current) : {}), [effective, current]);
  const dirty = Object.keys(patch).length > 0;
  const problem = effective && current ? draftProblem(effective, current) : null;
  const cutOff =
    effective && current ? cutsOffThisConsole(effective, current, window.location.origin, getApiBaseUrl()) : false;

  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [dirty]);
  const blocker = useBlocker(dirty && !saving);

  const update = useCallback((change: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...change } : d)), []);

  const addOrigin = () => {
    if (!draft) return;
    const why = originProblem(newOrigin, draft.extraOrigins);
    if (why) {
      setOriginError(why);
      return;
    }
    update({ extraOrigins: [...draft.extraOrigins, newOrigin.trim()] });
    setNewOrigin('');
    setOriginError(null);
  };

  const save = async () => {
    if (!dirty || problem || (cutOff && !cutOffOk)) return;
    setSaving(true);
    try {
      await saveFrontEnds(patch);
      toast({
        title: t('frontEnds.saved', 'Front ends saved'),
        description: t(
          'frontEnds.savedDetail',
          'Their sign-in is registered and every node now accepts requests from these addresses.',
        ),
      });
      setFetches((n) => n + 1);
    } catch (e) {
      toast({ variant: 'destructive', title: t('frontEnds.notSaved', 'Not saved'), description: message(e) });
    } finally {
      setSaving(false);
    }
  };

  const readOnly = !canSave;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon="globe"
        title={t('frontEnds.title', 'Front ends')}
        subtitle={t(
          'frontEnds.subtitle',
          'Where inbuxa Admin and the webmail are served from. Saving registers their sign-in and lets browsers on these addresses call the server, on every node.',
        )}
      />

      {load.kind === 'loading' && <LoadingFallback />}
      {load.kind === 'error' && (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">{load.message}</div>
      )}

      {current && draft && (
        <>
          {readOnly && (
            <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
              {t(
                'frontEnds.readOnly',
                'You can see these but not change them: that takes permission to update the HTTP settings and OAuth clients.',
              )}
            </p>
          )}

          <Section
            title={t('frontEnds.adminTitle', 'inbuxa Admin')}
            hint={t(
              'frontEnds.adminHint',
              'The console’s address when it isn’t served by the server itself, such as https://admin.example.com.',
            )}
          >
            <div className="space-y-1">
              <Label htmlFor="fe-admin">{t('frontEnds.address', 'Address')}</Label>
              <Input
                id="fe-admin"
                type="url"
                autoComplete="off"
                placeholder="https://admin.example.com"
                value={draft.adminUrl}
                disabled={readOnly}
                onChange={(e) => update({ adminUrl: e.target.value })}
              />
              {urlProblem(draft.adminUrl) && <p className="text-sm text-destructive">{urlProblem(draft.adminUrl)}</p>}
            </div>
            {current.environmentAdminUrl && (
              <FromEnvironment name="INBUXA_ADMIN_URL" value={current.environmentAdminUrl} />
            )}
          </Section>

          <Section
            title={t('frontEnds.webmailTitle', 'Webmail')}
            hint={t(
              'frontEnds.webmailHint',
              'The webmail’s address, the same as its PUBLIC_URL plus BASE_PATH. It signs in through the server with a client secret that both sides know.',
            )}
          >
            <div className="space-y-1">
              <Label htmlFor="fe-webmail">{t('frontEnds.address', 'Address')}</Label>
              <Input
                id="fe-webmail"
                type="url"
                autoComplete="off"
                placeholder="https://mail.example.com"
                value={draft.webmailUrl}
                disabled={readOnly}
                onChange={(e) => update({ webmailUrl: e.target.value })}
              />
              {urlProblem(draft.webmailUrl) && (
                <p className="text-sm text-destructive">{urlProblem(draft.webmailUrl)}</p>
              )}
            </div>
            {current.environmentWebmailUrl && (
              <FromEnvironment name="INBUXA_WEBMAIL_URL" value={current.environmentWebmailUrl} />
            )}

            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{t('frontEnds.secret', 'Client secret')}</span>
                {current.environmentWebmailClientSecret ? (
                  <Badge variant="secondary">{t('frontEnds.secretFromEnv', 'from INBUXA_WEBMAIL_CLIENT_SECRET')}</Badge>
                ) : current.webmailClientSecretSet && !draft.forgetSecret ? (
                  <Badge variant="secondary">{t('frontEnds.secretStored', 'stored')}</Badge>
                ) : (
                  <Badge variant="outline">{t('frontEnds.secretNone', 'none')}</Badge>
                )}
              </div>
              {current.environmentWebmailClientSecret ? (
                <p className="text-sm text-muted-foreground">
                  {t(
                    'frontEnds.secretEnvHint',
                    'This node takes the secret from its environment, which wins at every start. To set it here, remove INBUXA_WEBMAIL_CLIENT_SECRET from every node first.',
                  )}
                </p>
              ) : draft.webmailClientSecret ? (
                <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                  <p className="text-sm">
                    {t(
                      'frontEnds.secretNewHint',
                      'Put this in the webmail’s OAUTH_CLIENT_SECRET now: the server keeps only a hash, so it can’t be shown again after you save.',
                    )}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="break-all rounded bg-muted px-2 py-1 text-xs">{draft.webmailClientSecret}</code>
                    <CopyButton text={draft.webmailClientSecret} />
                    <Button type="button" variant="ghost" size="sm" onClick={() => update({ webmailClientSecret: '' })}>
                      {t('frontEnds.secretDiscard', 'Don’t change it')}
                    </Button>
                  </div>
                </div>
              ) : (
                !readOnly && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => update({ webmailClientSecret: newSecret(), forgetSecret: false })}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      {current.webmailClientSecretSet
                        ? t('frontEnds.secretReplace', 'Make a new secret')
                        : t('frontEnds.secretMake', 'Make a secret')}
                    </Button>
                    {current.webmailClientSecretSet && !draft.webmailUrl.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => update({ forgetSecret: !draft.forgetSecret })}
                      >
                        {draft.forgetSecret
                          ? t('frontEnds.secretKeep', 'Keep the stored secret')
                          : t('frontEnds.secretForget', 'Forget the stored secret')}
                      </Button>
                    )}
                  </div>
                )
              )}
              {!current.environmentWebmailClientSecret && (
                <p className="text-xs text-muted-foreground">
                  {t(
                    'frontEnds.secretRules',
                    'Made here, at least {{min}} characters, never shown again once saved. A new one stops the webmail signing in until it has the new one too.',
                    { min: MIN_SECRET_LENGTH },
                  )}
                </p>
              )}
            </div>
          </Section>

          <Section
            title={t('frontEnds.originsTitle', 'Other origins')}
            hint={t(
              'frontEnds.originsHint',
              'Further sites allowed to call the server from a browser, such as a second webmail. Just the origin: https://host or https://host:port.',
            )}
          >
            {draft.extraOrigins.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('frontEnds.originsNone', 'None.')}</p>
            ) : (
              <ul className="space-y-1">
                {draft.extraOrigins.map((o) => (
                  <li key={o} className="flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span className="break-all">{o}</span>
                    {!readOnly && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={t('frontEnds.originRemove', 'Remove {{origin}}', { origin: o })}
                        onClick={() => update({ extraOrigins: draft.extraOrigins.filter((x) => x !== o) })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    aria-label={t('frontEnds.originAdd', 'Add an origin')}
                    type="url"
                    autoComplete="off"
                    placeholder="https://other.example.com"
                    value={newOrigin}
                    onChange={(e) => {
                      setNewOrigin(e.target.value);
                      setOriginError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addOrigin();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={addOrigin}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('frontEnds.add', 'Add')}
                  </Button>
                </div>
                {originError && <p className="text-sm text-destructive">{originError}</p>}
              </div>
            )}
          </Section>

          {cutOff && (
            <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/5 p-3 text-sm">
              <p>
                {t(
                  'frontEnds.cutOff',
                  'You’re using the console at {{origin}}. After this change the server stops accepting requests from it, unless INBUXA_CORS_EXTRA_ORIGINS on every node names it, so this console would stop working. Change it from a console at the new address, or keep this one in Other origins.',
                  { origin: window.location.origin },
                )}
              </p>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={cutOffOk} onChange={(e) => setCutOffOk(e.target.checked)} />
                {t('frontEnds.cutOffOk', 'I understand; save anyway')}
              </label>
            </div>
          )}

          {!readOnly && (
            <div className="flex flex-wrap items-center justify-end gap-3">
              {problem && dirty && <span className="text-sm text-destructive">{problem}</span>}
              {dirty && !problem && (
                <span className="text-xs text-muted-foreground">{t('frontEnds.unsaved', 'Unsaved changes')}</span>
              )}
              <Button
                variant="outline"
                disabled={!dirty || saving}
                onClick={() => {
                  setDraft(draftOf(current));
                  setNewOrigin('');
                  setOriginError(null);
                  setCutOffOk(false);
                }}
              >
                {t('frontEnds.undo', 'Undo changes')}
              </Button>
              <Button disabled={!dirty || !!problem || saving || (cutOff && !cutOffOk)} onClick={() => void save()}>
                {saving ? t('frontEnds.saving', 'Saving…') : t('frontEnds.save', 'Save')}
              </Button>
            </div>
          )}

          {current.changedAt && (
            <p className="text-xs text-muted-foreground">
              {t('frontEnds.changed', 'Last changed {{when}} by account {{who}}.', {
                when: new Date(current.changedAt * 1000).toLocaleString(),
                who: current.changedBy ?? '?',
              })}
            </p>
          )}
        </>
      )}

      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('form.unsavedChangesTitle', 'Unsaved changes')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('form.unsavedChanges', 'You have unsaved changes. Are you sure you want to leave?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>{t('form.stay', 'Stay')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>{t('form.leave', 'Leave')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
