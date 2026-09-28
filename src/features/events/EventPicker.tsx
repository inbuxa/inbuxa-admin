/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: choosing events out of 649, grouped by category with a switch for
 * the whole group, a search that reads the explanations too, and a few
 * common picks (settings-reorg, second wave). Used wherever a form asks for
 * a set of EventType: webhooks and tracers.
 */

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Search } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { EnumVariant } from '@/types/schema';
import { cn } from '@/lib/utils';
import { COMMON_PICKS, groupEvents } from './eventGroups';

export function EventPicker({
  variants,
  items,
  onChange,
  readOnly,
}: {
  variants: EnumVariant[];
  items: string[];
  onChange: (items: string[]) => void;
  readOnly: boolean;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const chosen = useMemo(() => new Set(items), [items]);
  const known = useMemo(() => new Set(variants.map((v) => v.name)), [variants]);
  const groups = useMemo(() => groupEvents(variants, search), [variants, search]);

  const set = (names: string[], on: boolean) => {
    const next = new Set(chosen);
    for (const n of names) {
      if (on) next.add(n);
      else next.delete(n);
    }
    onChange([...next]);
  };

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t('eventPicker.common', 'Common picks')}
        </p>
        <div className="flex flex-wrap gap-2">
          {COMMON_PICKS.map((p) => {
            const names = p.events.filter((e) => known.has(e));
            const all = names.length > 0 && names.every((n) => chosen.has(n));
            return (
              <button
                key={p.id}
                type="button"
                title={p.hint}
                disabled={readOnly}
                onClick={() => set(names, !all)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs transition-colors',
                  all ? 'border-primary bg-primary/10 text-primary' : 'hover:border-primary/60',
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('eventPicker.search', 'Search events, e.g. bounce, ban, certificate')}
          className="h-8"
        />
        <span className="shrink-0 text-xs text-muted-foreground">
          {t('eventPicker.chosen', '{{count}} chosen', { count: items.length })}
        </span>
      </div>

      <ul className="max-h-96 divide-y overflow-y-auto">
        {groups.map((g) => {
          const names = g.events.map((e) => e.name);
          const count = names.filter((n) => chosen.has(n)).length;
          const expanded = open.has(g.category) || search.trim() !== '';
          return (
            <li key={g.category} className="py-1.5">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={count === 0 ? false : count === names.length ? true : 'indeterminate'}
                  disabled={readOnly}
                  onCheckedChange={(v) => set(names, v === true)}
                  aria-label={g.name}
                />
                <button
                  type="button"
                  className="flex flex-1 items-center gap-1 text-left text-sm"
                  onClick={() =>
                    setOpen((s) => {
                      const next = new Set(s);
                      if (next.has(g.category)) next.delete(g.category);
                      else next.add(g.category);
                      return next;
                    })
                  }
                >
                  <ChevronRight className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-90')} />
                  <span className="font-medium">{g.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {count > 0 ? `${count}/${names.length}` : names.length}
                  </span>
                </button>
              </div>
              {expanded && (
                <ul className="ml-8 mt-1 space-y-1">
                  {g.events.map((e) => (
                    <li key={e.name}>
                      <label className="flex cursor-pointer items-start gap-2 text-sm">
                        <Checkbox
                          checked={chosen.has(e.name)}
                          disabled={readOnly}
                          onCheckedChange={(v) => set([e.name], v === true)}
                          className="mt-0.5"
                        />
                        <span>
                          {e.label}
                          <span className="ml-1 font-mono text-[11px] text-muted-foreground">{e.name}</span>
                          {e.explanation && (
                            <span className="block text-xs text-muted-foreground">{e.explanation}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
        {groups.length === 0 && (
          <li className="py-3 text-center text-sm text-muted-foreground">
            {t('eventPicker.none', 'No events match.')}
          </li>
        )}
      </ul>
    </div>
  );
}
