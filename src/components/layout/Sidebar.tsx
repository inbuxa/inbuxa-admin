/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as LucideIcons from 'lucide-react';
const { ChevronDown, Lock, PanelLeftClose, PanelLeftOpen } = LucideIcons;
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EnterpriseUpsell } from '@/components/common/EnterpriseUpsell';
import { IconTile } from '@/components/common/IconTile';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useUIStore } from '@/stores/uiStore';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { visibleLayouts } from '@/lib/layout';
import {
  checkIsEnterprise,
  checkLinkVisible,
  pathMatchesView,
  resolveViewPath,
  subtreeContainsActive,
  subtreeHasVisibleLink,
  visibleLinks,
} from '@/lib/navTree';
import type { Layout, LayoutItem, LayoutSubItem } from '@/types/schema';

interface AutoOpenCollapsibleProps {
  containsActive: boolean;
  children: React.ReactNode;
}

function AutoOpenCollapsible({ containsActive, children }: AutoOpenCollapsibleProps) {
  const [open, setOpen] = useState(containsActive);
  const [prevContainsActive, setPrevContainsActive] = useState(containsActive);
  if (containsActive !== prevContainsActive) {
    setPrevContainsActive(containsActive);
    if (containsActive) setOpen(true);
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      {children}
    </Collapsible>
  );
}

type ActiveItemRef = (el: HTMLButtonElement | null) => void;

interface SidebarSubItemProps {
  item: LayoutSubItem;
  depth: number;
  sectionName: string;
  currentPath: string;
  navigate: ReturnType<typeof useNavigate>;
  edition: string;
  onUpsell: () => void;
  activeItemRef: ActiveItemRef;
}

function SidebarSubItem({
  item,
  depth,
  sectionName,
  currentPath,
  navigate,
  edition,
  onUpsell,
  activeItemRef,
}: SidebarSubItemProps) {
  if (item.type === 'link') {
    if (!checkLinkVisible(item.viewName)) return null;

    const path = resolveViewPath(sectionName, item.viewName);
    const isActive = pathMatchesView(currentPath, sectionName, item.viewName);
    const enterprise = checkIsEnterprise(item.viewName);
    const isLocked = enterprise && edition === 'community';
    const isHidden = enterprise && edition === 'oss';

    if (isHidden) return null;

    return (
      <Button
        variant="ghost"
        ref={isActive ? activeItemRef : undefined}
        className={cn(
          'relative h-8 w-full justify-start gap-2 rounded-lg px-3 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground',
          isActive && 'bg-accent font-medium text-accent-foreground hover:bg-accent hover:text-accent-foreground',
        )}
        style={depth > 1 ? { paddingLeft: `${(depth - 1) * 12 + 12}px` } : undefined}
        onClick={() => {
          if (isLocked) {
            onUpsell();
          } else {
            navigate(path);
          }
        }}
      >
        <span className="truncate">{item.name || 'Overview'}</span>
        {isLocked && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
      </Button>
    );
  }

  if (item.type === 'container') {
    if (!subtreeHasVisibleLink(item.items, edition)) return null;

    const containsActive = subtreeContainsActive(item.items, currentPath, sectionName);
    return (
      <AutoOpenCollapsible containsActive={containsActive}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className="h-8 w-full justify-start gap-1.5 rounded-lg px-3 text-[13px] font-normal text-muted-foreground hover:bg-muted hover:text-foreground"
            style={depth > 1 ? { paddingLeft: `${(depth - 1) * 12 + 12}px` } : undefined}
          >
            <ChevronDown className="h-3 w-3 shrink-0 transition-transform duration-200 [[data-state=closed]>&]:rotate-[-90deg]" />
            <span className="truncate">{item.name}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {item.items.map((sub) => (
            <SidebarSubItem
              key={sub.type === 'link' ? sub.viewName : sub.name}
              item={sub}
              depth={depth + 1}
              sectionName={sectionName}
              currentPath={currentPath}
              navigate={navigate}
              edition={edition}
              onUpsell={onUpsell}
              activeItemRef={activeItemRef}
            />
          ))}
        </CollapsibleContent>
      </AutoOpenCollapsible>
    );
  }

  return null;
}

interface SidebarTopItemProps {
  item: LayoutItem;
  sectionName: string;
  currentPath: string;
  navigate: ReturnType<typeof useNavigate>;
  edition: string;
  onUpsell: () => void;
  activeItemRef: ActiveItemRef;
}

function SidebarTopItem({
  item,
  sectionName,
  currentPath,
  navigate,
  edition,
  onUpsell,
  activeItemRef,
}: SidebarTopItemProps) {
  if ('link' in item) {
    const { name, icon, viewName } = item.link;

    if (!checkLinkVisible(viewName)) return null;

    const path = resolveViewPath(sectionName, viewName);
    const isActive = pathMatchesView(currentPath, sectionName, viewName);
    const enterprise = checkIsEnterprise(viewName);
    const isLocked = enterprise && edition === 'community';
    const isHidden = enterprise && edition === 'oss';

    if (isHidden) return null;

    return (
      <Button
        variant="ghost"
        ref={isActive ? activeItemRef : undefined}
        className={cn(
          'h-10 w-full justify-start gap-3 rounded-xl px-2 font-medium text-foreground/85 hover:bg-muted hover:text-foreground',
          isActive && 'bg-accent text-accent-foreground hover:bg-accent',
        )}
        onClick={() => {
          if (isLocked) {
            onUpsell();
          } else {
            navigate(path);
          }
        }}
      >
        <IconTile name={icon} />
        <span className="truncate">{name}</span>
        {isLocked && <Lock className="ml-auto h-3 w-3 text-muted-foreground" />}
      </Button>
    );
  }

  if ('container' in item) {
    const { name, icon, items } = item.container;
    if (!subtreeHasVisibleLink(items, edition)) return null;

    const containsActive = subtreeContainsActive(items, currentPath, sectionName);

    return (
      <AutoOpenCollapsible containsActive={containsActive}>
        <CollapsibleTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'h-10 w-full justify-start gap-3 rounded-xl px-2 font-medium text-foreground/85 hover:bg-muted hover:text-foreground',
              containsActive && 'text-foreground',
            )}
          >
            <IconTile name={icon} />
            <span className="truncate">{name}</span>
            <ChevronDown className="ml-auto h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 [[data-state=closed]>&]:rotate-[-90deg]" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="ml-[1.35rem] mt-0.5 mb-1 space-y-0.5 border-l border-border pl-2.5">
          {items.map((sub) => (
            <SidebarSubItem
              key={sub.type === 'link' ? sub.viewName : sub.name}
              item={sub}
              depth={1}
              sectionName={sectionName}
              currentPath={currentPath}
              navigate={navigate}
              edition={edition}
              onUpsell={onUpsell}
              activeItemRef={activeItemRef}
            />
          ))}
        </CollapsibleContent>
      </AutoOpenCollapsible>
    );
  }

  return null;
}

/** INBUXA: one entry of the collapsed sidebar: its tile, a label on hover, a menu for a group. */
function RailItem({
  item,
  sectionName,
  currentPath,
  navigate,
  edition,
}: {
  item: LayoutItem;
  sectionName: string;
  currentPath: string;
  navigate: ReturnType<typeof useNavigate>;
  edition: string;
}) {
  const base = 'mx-auto flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-muted';
  if ('link' in item) {
    const { name, icon, viewName } = item.link;
    if (!checkLinkVisible(viewName)) return null;
    const isActive = pathMatchesView(currentPath, sectionName, viewName);
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={name}
            aria-current={isActive ? 'page' : undefined}
            className={cn(base, isActive && 'bg-accent')}
            onClick={() => navigate(resolveViewPath(sectionName, viewName))}
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
  const links = visibleLinks(items, edition);
  const containsActive = subtreeContainsActive(items, currentPath, sectionName);
  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label={name} className={cn(base, containsActive && 'bg-accent')}>
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
        {links.map((l) => (
          <DropdownMenuItem
            key={l.viewName}
            className={cn(pathMatchesView(currentPath, sectionName, l.viewName) && 'bg-accent text-accent-foreground')}
            onClick={() => navigate(resolveViewPath(sectionName, l.viewName))}
          >
            {l.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface SidebarProps {
  /**
   * INBUXA: in the modern shell the section bar does the navigating on a wide
   * screen, but a phone has no room for it — the sidebar stays as the
   * slide-over behind the hamburger, and nothing else.
   */
  mobileOnly?: boolean;
}

export function Sidebar({ mobileOnly = false }: SidebarProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSection = useUIStore((s) => s.activeSection);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggleSidebarCollapsed = useUIStore((s) => s.toggleSidebarCollapsed);
  const schema = useSchemaStore((s) => s.schema);
  const edition = useAccountStore((s) => s.edition);
  const permissions = useAccountStore((s) => s.permissions);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const activeItem = useRef<HTMLButtonElement | null>(null);
  const activeItemRef = useCallback<ActiveItemRef>((el) => {
    activeItem.current = el;
  }, []);

  const layouts = useMemo(() => {
    if (!schema) return [];
    const canGet = (prefix: string) => permissions.includes(`${prefix}Get`);
    return visibleLayouts(schema, edition, canGet, hasPermission);
  }, [schema, edition, permissions, hasPermission]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(max-width: 767px)').matches) {
      setSidebarOpen(false);
    }
  }, [location.pathname, setSidebarOpen]);

  useEffect(() => {
    activeItem.current?.scrollIntoView({ block: 'nearest' });
  }, [location.pathname, activeSection]);

  if (!sidebarOpen || !schema) return null;

  const layout: Layout | undefined = layouts.find((l) => l.name === activeSection);
  if (!layout) return null;

  // Folding to a rail is for wide screens; a phone keeps the slide-over, and so
  // does the modern shell, where the rail would sit under the section bar.
  const collapsed =
    !mobileOnly && sidebarCollapsed && typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches;

  if (collapsed) {
    return (
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
              <RailItem
                key={'link' in item ? item.link.viewName : item.container.name}
                item={item}
                sectionName={layout.name}
                currentPath={location.pathname}
                navigate={navigate}
                edition={edition}
              />
            ))}
          </nav>
        </aside>
      </TooltipProvider>
    );
  }

  return (
    <>
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
              <SidebarTopItem
                key={'link' in item ? item.link.viewName : item.container.name}
                item={item}
                sectionName={layout.name}
                currentPath={location.pathname}
                navigate={navigate}
                edition={edition}
                onUpsell={() => setUpsellOpen(true)}
                activeItemRef={activeItemRef}
              />
            ))}
          </nav>
        </div>

        <EnterpriseUpsell open={upsellOpen} onClose={() => setUpsellOpen(false)} />
      </aside>
    </>
  );
}
