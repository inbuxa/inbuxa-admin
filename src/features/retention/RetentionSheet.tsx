/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Storage › Retention, every "how long" in one place, as sentences
 * (settings-reorg, second wave). Shown on each of the four retention pages,
 * above that page's own settings (schedules and the like), which stay in
 * the form below.
 */

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Timer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getAccountId, jmapGet, jmapSet } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { JmapSetResponse } from '@/types/jmap';
import { toast } from '@/hooks/use-toast';
import { fetchLogSettings, updateLogSettings } from '@/features/hardening/logSettings';
import { cn } from '@/lib/utils';
import { fromParts, ITEMS, RETENTION_FIELDS, toParts, words, type Group, type Item, type Unit } from './items';

const OBJECT = 'x:DataRetention';
const DAY = 86_400_000;

/** One value being edited: null is the setting's "none" (never, off). */
type Draft = { n: string; unit: Unit } | null;

function draftOf(ms: number | null | undefined): Draft {
  if (ms === null || ms === undefined) return null;
  const { n, unit } = toParts(ms);
  return { n: String(n), unit };
}

function msOf(d: Draft): number | null {
  if (d === null) return null;
  const n = Number(d.n);
  return Number.isFinite(n) && n > 0 ? fromParts(Math.round(n), d.unit) : NaN;
}

export function RetentionSheet({ onSaved }: { onSaved?: () => void }) {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const canUpdate = useAccountStore((s) => s.hasObjectPermission('sysDataRetention', 'Update'));
  const canLogs = useAccountStore((s) => s.hasPermission('sysTracerUpdate'));
  const [saved, setSaved] = useState<Record<string, number | null> | null>(null);
  const [draft, setDraft] = useState<Record<string, Draft>>({});
  const [busy, setBusy] = useState(false);

  const defaults = schema?.fields[OBJECT]?.defaults ?? {};

  useEffect(() => {
    let live = true;
    Promise.all([
      jmapGet(OBJECT, getAccountId(OBJECT), ['singleton'], RETENTION_FIELDS),
      fetchLogSettings().catch(() => undefined),
    ])
      .then(([[res], logs]) => {
        const data = ((res?.[1] as { list?: Record<string, unknown>[] })?.list ?? [])[0] ?? {};
        const values: Record<string, number | null> = {};
        for (const f of RETENTION_FIELDS) values[f] = (data[f] as number | null | undefined) ?? null;
        if (logs !== undefined) values.logs = logs === null ? null : logs * DAY;
        if (!live) return;
        setSaved(values);
        setDraft(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, draftOf(v)])));
      })
      .catch(() => live && setSaved(null));
    return () => {
      live = false;
    };
  }, []);

  const changed = useMemo(() => {
    if (!saved) return [];
    // An unfinished number counts as a change, and the invalid check keeps it from saving.
    return Object.keys(saved).filter((k) => msOf(draft[k] ?? null) !== saved[k]);
  }, [saved, draft]);
  const invalid = Object.values(draft).some((d) => d !== null && Number.isNaN(msOf(d)));

  if (!saved) return null;

  const groupTitle: Record<Group, string> = {
    mailboxes: t('retention.mailboxes', 'In people’s mailboxes'),
    recovery: t('retention.recovery', 'Getting deleted things back'),
    records: t('retention.records', 'The server’s own records'),
  };

  const save = async () => {
    setBusy(true);
    try {
      const patch: Record<string, number | null> = {};
      for (const k of changed) if (k !== 'logs') patch[k] = msOf(draft[k] ?? null);
      if (Object.keys(patch).length > 0) {
        const [res] = await jmapSet(OBJECT, getAccountId(OBJECT), { update: { singleton: patch } });
        const body = res?.[1] as unknown as JmapSetResponse | undefined;
        const bad = body?.notUpdated?.singleton;
        if (bad) throw new Error(bad.description ?? bad.type);
      }
      if (changed.includes('logs')) {
        const ms = msOf(draft.logs ?? null);
        await updateLogSettings(ms === null ? null : Math.max(1, Math.round(ms / DAY)));
      }
      setSaved((s) => ({ ...s, ...Object.fromEntries(changed.map((k) => [k, msOf(draft[k] ?? null)])) }));
      // Settings saves announce themselves ("Saved and applied"); log files alone don't.
      if (Object.keys(patch).length === 0) toast({ title: t('retention.saved', 'Saved') });
      onSaved?.();
    } catch (e) {
      toast({
        variant: 'destructive',
        title: t('retention.failed', 'Not saved'),
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setBusy(false);
    }
  };

  const row = (item: Item) => {
    if (!(item.field in saved)) return null;
    const d = draft[item.field] ?? null;
    const editable = item.field === 'logs' ? canLogs : canUpdate;
    const def = defaults[item.field] as number | null | undefined;
    const isChanged = changed.includes(item.field);
    return (
      <li key={item.field} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
        <span>{item.before}</span>
        {d === null ? (
          <span className="font-medium">{item.none}</span>
        ) : (
          <>
            <Input
              type="number"
              min={1}
              value={d.n}
              disabled={!editable}
              onChange={(e) => setDraft((x) => ({ ...x, [item.field]: { n: e.target.value, unit: d.unit } }))}
              className={cn('h-8 w-20', Number.isNaN(msOf(d)) && 'border-destructive')}
              aria-label={item.before}
            />
            {item.field === 'logs' ? (
              <span>{t('retention.daysWord', 'days')}</span>
            ) : (
              <Select
                value={d.unit}
                disabled={!editable}
                onValueChange={(u) => setDraft((x) => ({ ...x, [item.field]: { n: d.n, unit: u as Unit } }))}
              >
                <SelectTrigger className="h-8 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">{t('retention.days', 'days')}</SelectItem>
                  <SelectItem value="hours">{t('retention.hours', 'hours')}</SelectItem>
                </SelectContent>
              </Select>
            )}
          </>
        )}
        {item.after && <span>{item.after}</span>}
        {editable && (
          <button
            type="button"
            className="text-xs text-primary hover:underline"
            onClick={() =>
              setDraft((x) => ({
                ...x,
                [item.field]: d === null ? draftOf(typeof def === 'number' ? def : 30 * DAY) : null,
              }))
            }
          >
            {d === null
              ? t('retention.setTime', 'set a time')
              : item.none.startsWith('off')
                ? t('retention.turnOff', 'turn off')
                : item.none === 'forever'
                  ? t('retention.keepForever', 'keep forever')
                  : t('retention.never', 'never')}
          </button>
        )}
        {isChanged && (
          <span className="rounded bg-primary/10 px-1.5 text-xs text-primary">{t('retention.unsaved', 'unsaved')}</span>
        )}
        {(item.hint || def !== undefined) && (
          <span className="basis-full text-xs text-muted-foreground">
            {item.hint}
            {item.hint && def !== undefined ? ' ' : ''}
            {def !== undefined &&
              t('retention.default', 'Default: {{value}}.', { value: def === null ? item.none : words(def) })}
          </span>
        )}
      </li>
    );
  };

  return (
    <div className="mx-auto max-w-4xl space-y-4 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <Timer className="h-5 w-5 text-primary" />
        <p className="flex-1 font-medium">{t('retention.title', 'How long things are kept')}</p>
        {changed.length > 0 && (
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy || invalid}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('retention.save', 'Save {{count}} changes', { count: changed.length })}
          </Button>
        )}
      </div>
      {(['mailboxes', 'recovery', 'records'] as Group[]).map((g) => (
        <section key={g}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{groupTitle[g]}</h3>
          <ul className="divide-y">{ITEMS.filter((i) => i.group === g).map(row)}</ul>
        </section>
      ))}
      <p className="text-xs text-muted-foreground">
        {t(
          'retention.holds',
          'Mail under a legal hold is kept whatever these say: deleting it archives it, and it doesn’t expire while held.',
        )}
      </p>
    </div>
  );
}
