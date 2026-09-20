/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: tier two of the modern shell. Tier one is the layout switcher in the
 * top bar (Management / Settings / Account, straight from `schema.layouts`);
 * this bar carries the active layout's own top-level items, each container
 * opening its children in a menu. No sidebar, so a list or a form gets the
 * whole window width.
 *
 * The item count comes from the server's schema, so it is never known ahead of
 * time: the bar measures its items once, then keeps whatever fits and folds the
 * rest into "More". A layout too deep for a menu bar at all keeps the sidebar —
 * AdminPanel decides that, not this component.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as LucideIcons from 'lucide-react';
const { ChevronDown, Lock, MoreHorizontal } = LucideIcons;
import { cn } from '@/lib/utils';
import { EnterpriseUpsell } from '@/components/common/EnterpriseUpsell';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAccountStore } from '@/stores/accountStore';
import {
  checkIsEnterprise,
  checkLinkVisible,
  pathMatchesView,
  resolveViewPath,
  subtreeContainsActive,
  subtreeHasVisibleLink,
  topItemKey,
  topItemVisible,
  visibleLinks,
} from '@/lib/navTree';
import type { Layout, LayoutItem, LayoutSubItem } from '@/types/schema';

/** Room kept for the "More" trigger when not everything fits. */
const MORE_WIDTH = 92;

function howManyFit(widths: number[], available: number): number {
  let total = 0;
  for (const w of widths) {
    total += w;
    if (total > available) {
      let withMore = 0;
      for (let j = 0; j < widths.length; j++) {
        withMore += widths[j];
        if (withMore + MORE_WIDTH > available) return j;
      }
      return widths.length;
    }
  }
  return widths.length;
}

const TRIGGER_CLASS =
  'relative flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-normal text-muted-foreground transition-colors hover:text-foreground';
const TRIGGER_ACTIVE =
  "font-medium text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-primary after:content-['']";

interface MenuBodyProps {
  items: LayoutSubItem[];
  sectionName: string;
  currentPath: string;
  edition: string;
  onPick: (viewName: string, locked: boolean) => void;
}

/**
 * A container's children. Direct links stay as items; a nested group becomes a
 * label over its own links, so "Emails" reads Queued / History: Inbound,
 * Outbound / Delivery tests rather than one flat list.
 */
function MenuBody({ items, sectionName, currentPath, edition, onPick }: MenuBodyProps) {
  return (
    <>
      {items.map((sub, i) => {
        if (sub.type === 'link') {
          if (!checkLinkVisible(sub.viewName)) return null;
          const enterprise = checkIsEnterprise(sub.viewName);
          if (enterprise && edition === 'oss') return null;
          const locked = enterprise && edition === 'community';
          return (
            <DropdownMenuItem
              key={sub.viewName}
              className={cn(
                pathMatchesView(currentPath, sectionName, sub.viewName) && 'bg-accent text-accent-foreground',
              )}
              onClick={() => onPick(sub.viewName, locked)}
            >
              <span className="truncate">{sub.name || 'Overview'}</span>
              {locked && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
            </DropdownMenuItem>
          );
        }

        if (!subtreeHasVisibleLink(sub.items, edition)) return null;
        const links = visibleLinks(sub.items, edition);
        return (
          <DropdownMenuGroup key={`${sub.name}-${i}`}>
            <DropdownMenuLabel className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {sub.name}
            </DropdownMenuLabel>
            {links.map((l) => (
              <DropdownMenuItem
                key={l.viewName}
                className={cn(
                  pathMatchesView(currentPath, sectionName, l.viewName) && 'bg-accent text-accent-foreground',
                )}
                onClick={() => onPick(l.viewName, checkIsEnterprise(l.viewName) && edition === 'community')}
              >
                <span className="truncate">{l.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        );
      })}
    </>
  );
}

interface ItemProps {
  item: LayoutItem;
  sectionName: string;
  currentPath: string;
  edition: string;
  onPick: (viewName: string, locked: boolean) => void;
  measureRef?: (el: HTMLElement | null) => void;
}

function SectionNavItem({ item, sectionName, currentPath, edition, onPick, measureRef }: ItemProps) {
  if ('link' in item) {
    const { name, viewName } = item.link;
    const enterprise = checkIsEnterprise(viewName);
    const locked = enterprise && edition === 'community';
    const isActive = pathMatchesView(currentPath, sectionName, viewName);
    return (
      <button
        type="button"
        ref={measureRef}
        aria-current={isActive ? 'page' : undefined}
        className={cn(TRIGGER_CLASS, isActive && TRIGGER_ACTIVE)}
        onClick={() => onPick(viewName, locked)}
      >
        {name}
        {locked && <Lock className="h-3 w-3" />}
      </button>
    );
  }

  const { name, items } = item.container;
  const containsActive = subtreeContainsActive(items, currentPath, sectionName);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          ref={measureRef}
          className={cn(TRIGGER_CLASS, 'data-[state=open]:text-foreground', containsActive && TRIGGER_ACTIVE)}
        >
          {name}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-70 transition-transform duration-200 data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={0} className="w-60">
        <MenuBody items={items} sectionName={sectionName} currentPath={currentPath} edition={edition} onPick={onPick} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SectionNav({ layout }: { layout: Layout }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const edition = useAccountStore((s) => s.edition);
  const [upsellOpen, setUpsellOpen] = useState(false);

  const items = useMemo(() => layout.items.filter((item) => topItemVisible(item, edition)), [layout, edition]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const measured = useRef<number[]>([]);
  const [available, setAvailable] = useState(0);

  /**
   * A different layout means different labels, so a measurement is only good
   * for the layout it was taken on: keeping the key beside the widths retires
   * the old ones without a reset pass.
   */
  const measureKey = `${layout.name}|${edition}`;
  const [measurement, setMeasurement] = useState<{ key: string; widths: number[] } | null>(null);
  const widths = measurement?.key === measureKey ? measurement.widths : null;

  /**
   * Attached only while a measurement is wanted. A ref closure is new on every
   * render, so React would re-run it — and force a reflow reading offsetWidth —
   * on each one; leaving it off once the widths are known keeps the bar free of
   * that on ordinary navigation.
   */
  const measureRefFor = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el) measured.current[index] = el.offsetWidth;
    },
    [],
  );

  useLayoutEffect(() => {
    if (widths !== null) return;
    const seen = measured.current.slice(0, items.length);
    if (seen.length !== items.length || seen.some((w) => !w)) return;
    setMeasurement({ key: measureKey, widths: seen });
  }, [widths, items.length, measureKey, location.pathname]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setAvailable(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setAvailable(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const onPick = useCallback(
    (viewName: string, locked: boolean) => {
      if (locked) {
        setUpsellOpen(true);
        return;
      }
      navigate(resolveViewPath(layout.name, viewName));
    },
    [navigate, layout.name],
  );

  // Before the first measurement every item renders, clipped by the scroller.
  const shown = widths === null || available === 0 ? items.length : howManyFit(widths, available);
  const overflowed = items.slice(shown);

  return (
    <nav
      aria-label={layout.name}
      className="sticky top-14 z-30 hidden h-12 items-stretch border-b bg-background px-4 md:flex"
    >
      <div ref={scrollerRef} className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        {items.slice(0, shown).map((item, i) => (
          <SectionNavItem
            key={topItemKey(item)}
            item={item}
            sectionName={layout.name}
            currentPath={location.pathname}
            edition={edition}
            onPick={onPick}
            measureRef={widths === null ? measureRefFor(i) : undefined}
          />
        ))}
      </div>

      {overflowed.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                TRIGGER_CLASS,
                'data-[state=open]:text-foreground',
                overflowed.some((item) =>
                  'link' in item
                    ? pathMatchesView(location.pathname, layout.name, item.link.viewName)
                    : subtreeContainsActive(item.container.items, location.pathname, layout.name),
                ) && TRIGGER_ACTIVE,
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              {t('nav.more', 'More')}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" sideOffset={0} className="w-60">
            {overflowed.map((item, i) => {
              if ('link' in item) {
                const { name, viewName } = item.link;
                const enterprise = checkIsEnterprise(viewName);
                return (
                  <DropdownMenuItem
                    key={viewName}
                    className={cn(
                      pathMatchesView(location.pathname, layout.name, viewName) && 'bg-accent text-accent-foreground',
                    )}
                    onClick={() => onPick(viewName, enterprise && edition === 'community')}
                  >
                    <span className="truncate">{name}</span>
                  </DropdownMenuItem>
                );
              }
              const { name, items: subItems } = item.container;
              return (
                <DropdownMenuGroup key={name}>
                  {i > 0 && <DropdownMenuSeparator />}
                  <DropdownMenuLabel className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {name}
                  </DropdownMenuLabel>
                  {visibleLinks(subItems, edition).map((l) => (
                    <DropdownMenuItem
                      key={l.viewName}
                      className={cn(
                        pathMatchesView(location.pathname, layout.name, l.viewName) &&
                          'bg-accent text-accent-foreground',
                      )}
                      onClick={() => onPick(l.viewName, checkIsEnterprise(l.viewName) && edition === 'community')}
                    >
                      <span className="truncate">{l.name}</span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuGroup>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <EnterpriseUpsell open={upsellOpen} onClose={() => setUpsellOpen(false)} />
    </nav>
  );
}
