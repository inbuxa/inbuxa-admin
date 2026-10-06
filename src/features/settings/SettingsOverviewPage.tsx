/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Settings › Overview, the landing page for Settings (settings-reorg).
 * The guided setups and, only when there are any, the pages whose values
 * differ from the defaults. The menu bar above does the navigating.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ListChecks } from 'lucide-react';
import { useSchemaStore } from '@/stores/schemaStore';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { checkLinkVisible, resolveViewPath } from '@/lib/navTree';
import { SETTINGS_LAYOUT_NAME } from '@/lib/settingsLayout';
import { resolveObject } from '@/lib/schemaResolver';
import { countChanged, singletonPages, type SettingsPageRef } from './changedFromDefault';
import { SENDING_WIZARD_VIEW, SendingLaunchChoice } from '@/features/sending/SendingSetupCard';
import { DIRECTORY_WIZARD_VIEW, DirectoryLaunchChoice } from '@/features/directory/DirectorySetupCard';
import { LIMITS_WIZARD_VIEW, LimitsLaunchChoice } from '@/features/limits/LimitsSummary';
import { CERTIFICATE_WIZARD_VIEW, CertificateLaunchChoice } from '@/features/certificates/CertificateSetupCard';

/** Calls per JMAP request; the protocol's own floor, so any server takes it. */
const CALLS_PER_REQUEST = 16;

interface GuidedSetup {
  id: string;
  title: string;
  blurb: string;
  /** Where the job starts: a page, or a "Guided or manual?" choice for a job with a wizard. */
  to: string | { choice: (props: { open: boolean; onOpenChange: (open: boolean) => void }) => ReactNode };
  /** The view whose visibility decides whether this reader sees the card. */
  gate: string;
  /** Whether it is already set up; left out when there's no cheap way to tell. */
  isDone?: () => Promise<boolean>;
}

async function anyExist(objectName: string): Promise<boolean> {
  const [res] = await jmapRequest([
    [`${objectName}/get`, { accountId: getAccountId(objectName), ids: null, properties: ['id'] }, '0'],
  ]);
  const list = res?.[1]?.list as unknown[] | undefined;
  return (list?.length ?? 0) > 0;
}

/** Each guided setup registers here as it lands. */
const GUIDED_SETUPS: GuidedSetup[] = [
  {
    id: 'limits',
    title: 'Sending and receiving limits',
    blurb: 'Rate limits that suit who uses this server, so one stolen password can’t send without end.',
    to: { choice: (props) => <LimitsLaunchChoice {...props} /> },
    gate: LIMITS_WIZARD_VIEW,
    isDone: async () => {
      const [res] = await jmapRequest([
        [
          'x:MtaInboundThrottle/get',
          { accountId: getAccountId('x:MtaInboundThrottle'), ids: null, properties: ['id'] },
          '0',
        ],
      ]);
      return ((res?.[1]?.list as unknown[] | undefined)?.length ?? 0) > 0;
    },
  },
  {
    id: 'directory',
    title: 'Connect a sign-in directory',
    blurb:
      'Let people sign in with Active Directory, LDAP or an OpenID Connect provider, tested before anything moves.',
    to: { choice: (props) => <DirectoryLaunchChoice {...props} /> },
    gate: DIRECTORY_WIZARD_VIEW,
  },
  {
    id: 'certificates',
    title: 'Certificates, automatically',
    blurb:
      'Free Let’s Encrypt certificates for your domains, with every name checked first and renewals handled for you.',
    to: { choice: (props) => <CertificateLaunchChoice {...props} /> },
    gate: CERTIFICATE_WIZARD_VIEW,
  },
  {
    id: 'sending',
    title: 'How this server sends mail',
    blurb: 'Check whether port 25 is open, then deliver directly or through a relay such as Amazon SES or Mailgun.',
    to: { choice: (props) => <SendingLaunchChoice {...props} /> },
    gate: SENDING_WIZARD_VIEW,
  },
  {
    id: 'dns',
    title: 'Publish DNS records automatically',
    blurb: 'Connect your DNS provider once, and each domain’s mail records are written and kept up to date for you.',
    to: '/Management/x:Domain',
    gate: 'x:DnsServer',
    isDone: () => anyExist('x:DnsServer'),
  },
  {
    id: 'local-ai',
    title: 'Local AI spam filtering',
    blurb: 'Run a small model on this server to help sort spam, with nothing sent anywhere else.',
    to: resolveViewPath(SETTINGS_LAYOUT_NAME, 'CustomComponent/LocalAi'),
    gate: 'CustomComponent/LocalAi',
  },
];

function useChangedPages(pages: SettingsPageRef[]) {
  const schema = useSchemaStore((s) => s.schema);
  const [changed, setChanged] = useState<(SettingsPageRef & { count: number })[]>([]);

  useEffect(() => {
    if (!schema || pages.length === 0) return;
    const ctrl = new AbortController();
    const objects = [...new Set(pages.map((pg) => resolveObject(schema, pg.viewName)!.objectName))];

    (async () => {
      const values = new Map<string, Record<string, unknown>>();
      const batches: string[][] = [];
      for (let i = 0; i < objects.length; i += CALLS_PER_REQUEST) batches.push(objects.slice(i, i + CALLS_PER_REQUEST));
      await Promise.all(
        batches.map(async (batch) => {
          const responses = await jmapRequest(
            batch.map((obj, i) => [`${obj}/get`, { accountId: getAccountId(obj), ids: ['singleton'] }, String(i)]),
            ctrl.signal,
          );
          for (const [method, result, callId] of responses) {
            if (method === 'error') continue;
            const item = (result.list as Record<string, unknown>[] | undefined)?.[0];
            if (item) values.set(batch[Number(callId)], item);
          }
        }),
      );
      if (ctrl.signal.aborted) return;
      const found = [];
      for (const pg of pages) {
        const data = values.get(resolveObject(schema, pg.viewName)!.objectName);
        const count = data ? countChanged(schema, pg.viewName, data) : 0;
        if (count > 0) found.push({ ...pg, count });
      }
      setChanged(found);
    })().catch(() => {
      // The list is a convenience; a failed read just leaves it out.
    });
    return () => ctrl.abort();
  }, [schema, pages]);

  return changed;
}

function SetupCard({ setup }: { setup: GuidedSetup }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  useEffect(() => {
    let live = true;
    setup
      .isDone?.()
      .then((d) => live && setDone(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [setup]);

  const [choosing, setChoosing] = useState(false);
  const className =
    'group flex flex-col gap-2 rounded-xl border bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-soft';
  const body = (
    <>
      <div className="flex items-center gap-2">
        <span className="font-medium">{setup.title}</span>
        {done && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="h-3.5 w-3.5" />
            {t('settingsOverview.setUp', 'Set up')}
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{setup.blurb}</p>
    </>
  );

  if (typeof setup.to === 'string') {
    return (
      <Link to={setup.to} className={className}>
        {body}
      </Link>
    );
  }
  return (
    <>
      <button type="button" className={className} onClick={() => setChoosing(true)}>
        {body}
      </button>
      {setup.to.choice({ open: choosing, onOpenChange: setChoosing })}
    </>
  );
}

export function SettingsOverviewPage() {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);

  const layout = useMemo(() => schema?.layouts.find((l) => l.name === SETTINGS_LAYOUT_NAME), [schema]);

  const pages = useMemo(
    () => (schema && layout ? singletonPages(schema, layout.items).filter((pg) => checkLinkVisible(pg.viewName)) : []),
    [schema, layout],
  );
  const changed = useChangedPages(pages);
  const setups = GUIDED_SETUPS.filter((s) => checkLinkVisible(s.gate));

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">{t('settingsOverview.title', 'Settings')}</h1>
        <p className="text-muted-foreground">
          {t(
            'settingsOverview.subtitle',
            'The menu above groups everything the server does by job. Anything you change is marked against its default.',
          )}
        </p>
      </header>

      {setups.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            <ListChecks className="h-4 w-4" />
            {t('settingsOverview.guided', 'Guided setup')}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {setups.map((s) => (
              <SetupCard key={s.id} setup={s} />
            ))}
          </div>
        </section>
      )}

      {changed.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {t('settingsOverview.changed', 'Changed from default')}
          </h2>
          <ul className="divide-y rounded-xl border bg-card">
            {changed.map((pg) => (
              <li key={pg.viewName}>
                <Link
                  to={resolveViewPath(SETTINGS_LAYOUT_NAME, pg.viewName)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/50"
                >
                  <span className="font-medium">{pg.label}</span>
                  <span className="text-muted-foreground">{pg.where}</span>
                  <span className="ml-auto text-muted-foreground">
                    {t('settingsOverview.changedCount', '{{count}} changed', { count: pg.count })}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
