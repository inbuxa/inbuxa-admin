/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown, Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import { IconTile } from '@/components/common/IconTile';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { visibleLayouts } from '@/lib/layout';
import {
  checkIsEnterprise,
  checkLinkVisible,
  pathMatchesView,
  resolveViewPath,
  subtreeContainsActive,
  subtreeHasVisibleLink,
  topItemKey,
  visibleLinks,
} from '@/lib/navTree';
import { cn } from '@/lib/utils';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useUIStore } from '@/stores/uiStore';
import type { LayoutItem, LayoutSubItem } from '@/types/schema';

interface NavPlace {
  section: string;
  path: string;
  edition: string;
  go: (path: string) => void;
  /** Given to the active link's button, so it can be scrolled into view. */
  activeRef: (el: HTMLButtonElement | null) => void;
}

const Place = createContext<NavPlace | null>(null);
const usePlace = () => useContext(Place)!;

/** How a link shows: not at all, locked (an enterprise page on the community edition), or open. */
function linkState(viewName: string, edition: string): 'hidden' | 'locked' | 'open' {
  if (!checkLinkVisible(viewName)) return 'hidden';
  if (!checkIsEnterprise(viewName)) return 'open';
  return edition === 'oss' ? 'hidden' : edition === 'community' ? 'locked' : 'open';
}

/** A group that opens by itself when the page it holds becomes the active one. */
function Group({ holdsActive, children }: { holdsActive: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(holdsActive);
  const [lastHoldsActive, setLastHoldsActive] = useState(holdsActive);
  if (holdsActive !== lastHoldsActive) {
    setLastHoldsActive(holdsActive);
    if (holdsActive) setOpen(true);
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {children}
    </Collapsible>
  );
}

const indent = (depth: number) => (depth > 1 ? { paddingLeft: `${(depth - 1) * 12 + 12}px` } : undefined);
const subKey = (item: LayoutSubItem) => (item.type === 'link' ? item.viewName : item.name);
const CHEVRON = 'shrink-0 transition-transform duration-200 [[data-state=closed]>&]:rotate-[-90deg]';

function SubItem({ item, depth }: { item: LayoutSubItem; depth: number }) {
  const { section, path, edition, go, activeRef } = usePlace();

  if (item.type === 'link') {
    const state = linkState(item.viewName, edition);
    if (state === 'hidden') return null;
    const active = pathMatchesView(path, section, item.viewName);
    return (
      <Button
        variant="ghost"
        ref={active ? activeRef : undefined}
        className={cn(
          'relative h-8 w-full justify-start gap-2 rounded-lg px-3 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground',
          active && 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        )}
        style={indent(depth)}
        onClick={() => {
          if (state === 'open') go(resolveViewPath(section, item.viewName));
        }}
      >
        <span className="truncate">{item.name || 'Overview'}</span>
        {state === 'locked' && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
      </Button>
    );
  }

  if (!subtreeHasVisibleLink(item.items, edition)) return null;
  return (
    <Group holdsActive={subtreeContainsActive(item.items, path, section)}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="h-8 w-full justify-start gap-1.5 rounded-lg px-3 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
          style={indent(depth)}
        >
          <ChevronDown className={cn('h-3 w-3', CHEVRON)} />
          <span className="truncate">{item.name}</span>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {item.items.map((sub) => (
          <SubItem key={subKey(sub)} item={sub} depth={depth + 1} />
        ))}
      </CollapsibleContent>
    </Group>
  );
}

const TOP =
  'h-10 w-full justify-start gap-3 rounded-xl px-2 font-medium text-foreground/85 hover:bg-muted hover:text-foreground';

function TopItem({ item }: { item: LayoutItem }) {
  const { section, path, edition, go, activeRef } = usePlace();

  if ('link' in item) {
    const { name, icon, viewName } = item.link;
    const state = linkState(viewName, edition);
    if (state === 'hidden') return null;
    const active = pathMatchesView(path, section, viewName);
    return (
      <Button
        variant="ghost"
        ref={active ? activeRef : undefined}
        className={cn(TOP, active && 'bg-accent text-accent-foreground hover:bg-accent')}
        onClick={() => {
          if (state === 'open') go(resolveViewPath(section, viewName));
        }}
      >
        <IconTile name={icon} />
        <span className="truncate">{name}</span>
        {state === 'locked' && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
      </Button>
    );
  }

  const { name, icon, items } = item.container;
  if (!subtreeHasVisibleLink(items, edition)) return null;
  const holdsActive = subtreeContainsActive(items, path, section);
  return (
    <Group holdsActive={holdsActive}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className={cn(TOP, holdsActive && 'text-foreground')}>
          <IconTile name={icon} />
          <span className="truncate">{name}</span>
          <ChevronDown className={cn('ml-auto h-3.5 w-3.5 text-muted-foreground', CHEVRON)} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-[1.35rem] mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2.5">
        {items.map((sub) => (
          <SubItem key={subKey(sub)} item={sub} depth={1} />
        ))}
      </CollapsibleContent>
    </Group>
  );
}

const RAIL = 'mx-auto flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-muted';

/** One entry of the folded sidebar: its tile, its name on hover, and a menu for a group. */
function RailItem({ item }: { item: LayoutItem }) {
  const { section, path, edition, go } = usePlace();

  if ('link' in item) {
    const { name, icon, viewName } = item.link;
    if (!checkLinkVisible(viewName)) return null;
    const active = pathMatchesView(path, section, viewName);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={name}
            aria-current={active ? 'page' : undefined}
            className={cn(RAIL, active && 'bg-accent')}
            onClick={() => go(resolveViewPath(section, viewName))}
          >
            <IconTile name={icon} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
    );
  }

  const { name, icon, items } = item.container;
  if (!subtreeHasVisibleLink(items, edition)) return null;
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={name}
              className={cn(RAIL, subtreeContainsActive(items, path, section) && 'bg-accent')}
            >
              <IconTile name={icon} />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="right">{name}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="right" align="start" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2">
          <IconTile name={icon} size="sm" />
          {name}
        </DropdownMenuLabel>
        {visibleLinks(items, edition).map((link) => (
          <DropdownMenuItem
            key={link.viewName}
            className={cn(pathMatchesView(path, section, link.viewName) && 'bg-accent text-accent-foreground')}
            onClick={() => go(resolveViewPath(section, link.viewName))}
          >
            {link.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const isPhone = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches;
const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

interface SidebarProps {
  /**
   * In the modern shell the section bar navigates on a wide screen, but a
   * phone has no room for it: the sidebar stays only as the slide-over
   * behind the menu button.
   */
  mobileOnly?: boolean;
}

/** The current section's pages: a slide-over on a phone, a column or a folded rail on a wide screen. */
export function Sidebar({ mobileOnly = false }: SidebarProps = {}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeSection = useUIStore((s) => s.activeSection);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);
  const schema = useSchemaStore((s) => s.schema);
  const edition = useAccountStore((s) => s.edition);
  const permissions = useAccountStore((s) => s.permissions);
  const hasPermission = useAccountStore((s) => s.hasPermission);

  const activeItem = useRef<HTMLButtonElement | null>(null);
  const activeRef = useCallback((el: HTMLButtonElement | null) => {
    activeItem.current = el;
  }, []);

  const layout = useMemo(() => {
    if (!schema) return undefined;
    const canGet = (prefix: string) => permissions.includes(`${prefix}Get`);
    return visibleLayouts(schema, edition, canGet, hasPermission).find((l) => l.name === activeSection);
  }, [schema, edition, permissions, hasPermission, activeSection]);

  // On a phone, moving to a page closes the slide-over.
  useEffect(() => {
    if (isPhone()) setSidebarOpen(false);
  }, [pathname, setSidebarOpen]);

  useEffect(() => {
    activeItem.current?.scrollIntoView({ block: 'nearest' });
  }, [pathname, activeSection]);

  if (!sidebarOpen || !schema || !layout) return null;

  const place: NavPlace = { section: layout.name, path: pathname, edition, go: navigate, activeRef };

  // Folding to a rail is for wide screens; a phone keeps the slide-over, and so
  // does the modern shell, where the rail would sit under the section bar.
  if (!mobileOnly && sidebarCollapsed && isWide()) {
    return (
      <Place.Provider value={place}>
        <TooltipProvider delayDuration={150}>
          <aside className="fixed top-14 left-0 bottom-0 z-30 flex w-[4.5rem] flex-col border-r bg-background">
            <div className="flex justify-center border-b py-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Expand sidebar"
                    onClick={toggleSidebarCollapsed}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto py-3 [scrollbar-width:none]">
              {layout.items.map((item) => (
                <RailItem key={topItemKey(item)} item={item} />
              ))}
            </nav>
          </aside>
        </TooltipProvider>
      </Place.Provider>
    );
  }

  return (
    <Place.Provider value={place}>
      <div
        aria-hidden="true"
        className="fixed inset-0 top-14 z-20 bg-black/40 md:hidden"
        onClick={() => setSidebarOpen(false)}
      />
      <aside
        className={cn(
          'fixed top-14 left-0 bottom-0 z-30 flex w-64 flex-col border-r bg-background',
          mobileOnly && 'md:hidden',
        )}
      >
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {layout.name}
          </span>
          <button
            type="button"
            aria-label="Collapse sidebar"
            title="Collapse sidebar"
            onClick={toggleSidebarCollapsed}
            className={cn(
              'hidden h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground md:flex',
              mobileOnly && 'md:hidden',
            )}
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-2 [scrollbar-width:thin]">
          <nav className="flex flex-col gap-0.5 px-2">
            {layout.items.map((item) => (
              <TopItem key={topItemKey(item)} item={item} />
            ))}
          </nav>
        </div>
      </aside>
    </Place.Provider>
  );
}
