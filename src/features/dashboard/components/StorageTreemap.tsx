/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, HardDrive } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Corners } from './Panel';
import { cn } from '@/lib/utils';
import { formatValue } from '../helpers';
import { squarify } from '../treemap';
import type { StorageUse } from '../serverFacts';

const MAX_TILES = 24;
const HEIGHT = 260;

/** How full an account is, as a tile color: calm until it nears its quota. */
function fillClass(u: StorageUse): string {
  if (!u.quota) return 'bg-[var(--chart-1)]/75 hover:bg-[var(--chart-1)]';
  const pct = u.used / u.quota;
  if (pct >= 0.9) return 'bg-rose-500/80 hover:bg-rose-500';
  if (pct >= 0.75) return 'bg-amber-500/80 hover:bg-amber-500';
  return 'bg-[var(--chart-1)]/75 hover:bg-[var(--chart-1)]';
}

/**
 * Who uses the storage, as a map: every person is a tile sized by the space
 * their mail, files and calendars take, and colored by how close they are to
 * their quota. The biggest users are the biggest tiles; a click opens them.
 */
export function StorageTreemap({ storage }: { storage: StorageUse[] }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { tiles, total, others } = useMemo(() => {
    const sorted = [...storage].filter((s) => s.used > 0).sort((a, b) => b.used - a.used);
    const top = sorted.slice(0, MAX_TILES);
    const rest = sorted.slice(MAX_TILES);
    const restUse = rest.reduce((s, r) => s + r.used, 0);
    const items: StorageUse[] = restUse
      ? [
          ...top,
          { id: '', name: t('storage.others', '{{count}} others', { count: rest.length }), used: restUse, quota: null },
        ]
      : top;
    return {
      tiles: squarify(items, (i) => i.used, width, HEIGHT),
      total: sorted.reduce((s, r) => s + r.used, 0),
      others: rest.length,
    };
  }, [storage, width, t]);

  const nearFull = storage.filter((s) => s.quota && s.used / s.quota >= 0.9).length;

  return (
    <Card className="relative flex h-full flex-col">
      <Corners />
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-3">
        <div>
          <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('storage.title', 'Who uses the space')}
          </CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {total > 0
              ? t('storage.subtitle', '{{total}} across {{count}} people', {
                  total: formatValue(total, 'bytes'),
                  count: storage.length,
                })
              : t('storage.empty', 'No one has stored anything yet.')}
            {nearFull > 0 && (
              <span className="ml-2 font-medium text-rose-600 dark:text-rose-400">
                {t('storage.nearFull', {
                  count: nearFull,
                  defaultValue_one: '{{count}} nearly full',
                  defaultValue_other: '{{count}} nearly full',
                })}
              </span>
            )}
          </p>
        </div>
        <Link
          to="/Management/x:Account/User"
          className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
        >
          {t('storage.seePeople', 'See people')}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        <div ref={box} className="relative w-full overflow-hidden rounded-xl" style={{ height: HEIGHT }}>
          {total === 0 && (
            <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm text-muted-foreground">
              <HardDrive className="h-6 w-6" />
              {t('storage.emptyHint', 'Tiles appear here as people store mail and files.')}
            </div>
          )}
          {tiles.map(({ item, x, y, w, h }) => {
            const pct = item.quota ? Math.round((item.used / item.quota) * 100) : null;
            const label = `${item.name}: ${formatValue(item.used, 'bytes')}${pct !== null ? ` (${pct}%)` : ''}`;
            const roomy = w > 90 && h > 44;
            const style = { left: x + 1, top: y + 1, width: Math.max(0, w - 2), height: Math.max(0, h - 2) };
            const body = (
              <>
                {roomy && (
                  <>
                    <span className="block truncate text-xs font-medium">{item.name}</span>
                    <span className="block text-[11px] opacity-80">
                      {formatValue(item.used, 'bytes')}
                      {pct !== null && ` · ${pct}%`}
                    </span>
                  </>
                )}
              </>
            );
            const cls = cn(
              'absolute overflow-hidden rounded-md p-2 text-left text-white transition-colors',
              item.id ? fillClass(item) : 'bg-muted-foreground/40',
            );
            return item.id ? (
              <Link
                key={item.id}
                to={`/Management/x:Account/User/${item.id}`}
                title={label}
                className={cls}
                style={style}
              >
                {body}
              </Link>
            ) : (
              <div key="others" title={label} className={cls} style={style}>
                {body}
              </div>
            );
          })}
        </div>
        {others > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {t('storage.topOnly', 'The {{count}} biggest are shown on their own.', { count: MAX_TILES })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
