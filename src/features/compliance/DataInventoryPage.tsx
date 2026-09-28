/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Management › Compliance › Data Inventory (personal-data catalog
 * spec, §8). What this server holds, evaluated from its settings: each kind
 * of personal data, whose it is, where it lives, how long it's kept and
 * whether it leaves the server; then every host that receives some. Facts
 * only; whether a host is a processor is the operator's to determine.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader } from '@/components/common/PageHeader';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { cn } from '@/lib/utils';
import {
  EMPTY_INVENTORY_FILTER,
  fetchInventory,
  filterItems,
  InventoryUnavailable,
  itemName,
  retentionText,
  whereName,
  type Inventory,
  type InventoryFilter,
} from './inventory';

const CATEGORIES = ['identifier', 'contact', 'network', 'content', 'metadata', 'credential'];
const PLACES = ['data-store', 'blob-store', 'search-store', 'in-memory-store', 'memory', 'log-file', 'external'];
const ANY = '__any';

type Load = { kind: 'loading' } | { kind: 'ready'; inventory: Inventory } | { kind: 'error'; message: string };

export function DataInventoryPage() {
  const { t } = useTranslation();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [filter, setFilter] = useState<InventoryFilter>(EMPTY_INVENTORY_FILTER);

  useEffect(() => {
    const controller = new AbortController();
    fetchInventory(controller.signal)
      .then((inventory) => !controller.signal.aborted && setLoad({ kind: 'ready', inventory }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          kind: 'error',
          message:
            e instanceof InventoryUnavailable
              ? t('inventory.unavailable', 'This server doesn’t report a data inventory.')
              : e instanceof Error
                ? e.message
                : String(e),
        });
      });
    return () => controller.abort();
  }, [t]);

  const items = useMemo(() => (load.kind === 'ready' ? filterItems(load.inventory.items, filter) : []), [load, filter]);

  if (load.kind === 'loading') return <LoadingFallback />;
  if (load.kind === 'error') {
    return (
      <div className="mx-auto max-w-5xl rounded-lg border border-dashed p-12 text-center text-muted-foreground">
        {load.message}
      </div>
    );
  }
  const { inventory } = load;
  const names = new Map(inventory.items.map((i) => [i.id, itemName(i.id)]));
  const pick = (value: string) => (value === ANY ? '' : value);

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        icon="database"
        title={t('inventory.title', 'Data inventory')}
        subtitle={t(
          'inventory.subtitle',
          'What this server holds about people, worked out from its settings as they are now: where each kind of data lives, how long it’s kept, and where it goes.',
        )}
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Select
          value={filter.kind || ANY}
          onValueChange={(v) => setFilter({ ...filter, kind: pick(v) as InventoryFilter['kind'] })}
        >
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('inventory.anyKind', 'Every source')}</SelectItem>
            <SelectItem value="object">{t('inventory.objects', 'Stored records')}</SelectItem>
            <SelectItem value="source">{t('inventory.sources', 'Files, exports and lookups')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filter.category || ANY} onValueChange={(v) => setFilter({ ...filter, category: pick(v) })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('inventory.anyCategory', 'Any kind of data')}</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filter.where || ANY} onValueChange={(v) => setFilter({ ...filter, where: pick(v) })}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ANY}>{t('inventory.anyPlace', 'Anywhere')}</SelectItem>
            {PLACES.map((p) => (
              <SelectItem key={p} value={p}>
                {whereName(p)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={!filter.onlyCollected}
            onCheckedChange={(v) => setFilter({ ...filter, onlyCollected: v !== true })}
          />
          {t('inventory.showOff', 'Also show what this server doesn’t collect')}
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">{t('inventory.colWhat', 'What')}</th>
              <th className="px-4 py-2 font-medium">{t('inventory.colHolds', 'Holds')}</th>
              <th className="px-4 py-2 font-medium">{t('inventory.colWhose', 'Whose')}</th>
              <th className="px-4 py-2 font-medium">{t('inventory.colWhere', 'Where')}</th>
              <th className="px-4 py-2 font-medium">{t('inventory.colKept', 'Kept')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className={cn('border-t align-top', !item.collected && 'text-muted-foreground')}>
                <td className="px-4 py-2">
                  <div className="font-medium">{names.get(item.id)}</div>
                  <div className="font-mono text-xs text-muted-foreground">{item.id}</div>
                  {!item.collected && (
                    <Badge variant="outline" className="mt-1">
                      {t('inventory.notCollected', 'Not collected here')}
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-2">{item.categories.join(', ')}</td>
                <td className="px-4 py-2">{item.whose.join(', ')}</td>
                <td className="px-4 py-2">
                  {item.where.map(whereName).join(', ')}
                  {item.leavesHost && (
                    <div className="mt-1 text-xs">
                      {t('inventory.leaves', 'Leaves this server')}
                      {item.endpoints.length > 0 && `: ${item.endpoints.join(', ')}`}
                    </div>
                  )}
                </td>
                <td className="px-4 py-2">
                  <div>{retentionText(item.retention)}</div>
                  {'setting' in item.retention && item.retention.setting && item.retention.kind !== 'setting' && (
                    <div className="font-mono text-xs text-muted-foreground">{item.retention.setting}</div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {items.length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">{t('inventory.none', 'Nothing matches.')}</p>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">{t('inventory.hostsTitle', 'Hosts that receive personal data')}</h2>
        <p className="text-sm text-muted-foreground">
          {t(
            'inventory.hostsBody',
            'Each is a candidate processor. Whether it is one, and what agreement it needs, is for you to determine.',
          )}
        </p>
        {inventory.processors.length === 0 ? (
          <p className="rounded-xl border px-4 py-3 text-sm text-muted-foreground">
            {t('inventory.noHosts', 'Nothing this server collects is sent to another host.')}
          </p>
        ) : (
          <ul className="divide-y rounded-xl border text-sm">
            {inventory.processors.map((p) => (
              <li key={p.host} className="flex flex-wrap items-start justify-between gap-2 px-4 py-2">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  {p.host}
                </span>
                <span className="text-muted-foreground">
                  {p.receives.join(', ')} · {p.sources.map((s) => names.get(s) ?? s).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        {t('inventory.evaluated', 'Worked out {{when}}, from the catalog in {{version}}.', {
          when: inventory.evaluatedAt ? new Date(inventory.evaluatedAt).toLocaleString() : '',
          version: inventory.catalogVersion,
        })}
      </p>
    </div>
  );
}
