/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Settings › Overview, the landing page for Settings (settings-reorg).
 * A card per category explaining what that menu item covers, the guided setups, and, only
 * when there are any, the pages whose values differ from the defaults.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, ListChecks } from 'lucide-react';
import { IconTile } from '@/components/common/IconTile';
import { useSchemaStore } from '@/stores/schemaStore';
import { useAccountStore } from '@/stores/accountStore';
import { getAccountId, jmapRequest } from '@/services/jmap/client';
import { checkLinkVisible, resolveViewPath, topItemVisible } from '@/lib/navTree';
import { SETTINGS_CATEGORIES, SETTINGS_LAYOUT_NAME } from '@/lib/settingsLayout';
import { resolveObject } from '@/lib/schemaResolver';
import { countChanged, singletonPages, type SettingsPageRef } from './changedFromDefault';

/** Calls per JMAP request; the protocol's own floor, so any server takes it. */
const CALLS_PER_REQUEST = 16;

interface GuidedSetup {
  id: string;
  title: string;
  blurb: string;
  /** Where the job starts. */
  to: string;
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

  return (
    <Link
      to={setup.to}
      className="group flex flex-col gap-2 rounded-xl border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/60 hover:shadow-soft"
    >
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
    </Link>
  );
}

export function SettingsOverviewPage() {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const edition = useAccountStore((s) => s.edition);

  const layout = useMemo(() => schema?.layouts.find((l) => l.name === SETTINGS_LAYOUT_NAME), [schema]);

  // What each item in the menu bar covers: explainers only, the bar does the navigating.
  const cards = useMemo(() => {
    if (!layout) return [];
    return SETTINGS_CATEGORIES.filter((cat) => {
      const item = layout.items.find((it) => 'container' in it && it.container.name === cat.name);
      return item !== undefined && topItemVisible(item, edition);
    });
  }, [layout, edition]);

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
            'The menu above groups everything the server does by job. Here is what each part covers. Anything you change is marked against its default.',
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

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((cat) => (
          <div key={cat.name} className="flex flex-col gap-3 rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <IconTile name={cat.icon} size="lg" />
              <h2 className="text-lg font-semibold">{cat.name}</h2>
            </div>
            <p className="text-sm text-muted-foreground">{cat.blurb}</p>
          </div>
        ))}
      </section>

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
