/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createElement, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Accessibility,
  Check,
  FileCode,
  Keyboard,
  LayoutTemplate,
  LogOut,
  Menu,
  Moon,
  Palette,
  Search,
  Sun,
  User,
} from 'lucide-react';

import { CommandPalette } from '@/components/common/CommandPalette';
import Logo from '@/components/common/Logo';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { isContrastPref, isMotionPref } from '@/lib/a11yPrefs';
import { iconByName } from '@/lib/iconByName';
import { sectionLandingLink } from '@/lib/lastVisited';
import { visibleLayouts } from '@/lib/layout';
import { isPaletteId, PALETTES } from '@/lib/palettes';
import { isCommandBarKey, OPEN_COMMAND_BAR, OPEN_SHORTCUTS } from '@/lib/shortcuts';
import { SOURCE_URL } from '@/lib/sourceDownload';
import { cn } from '@/lib/utils';
import { signOut } from '@/services/auth/signOut';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { isAdminLayout, useUIStore } from '@/stores/uiStore';
import type { Layout } from '@/types/schema';

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

/** The layouts this account may visit, and a way to open one where it was last left. */
function useSections() {
  const navigate = useNavigate();
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const edition = useAccountStore((s) => s.edition);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const schema = useSchemaStore((s) => s.schema);
  const canGet = (prefix: string) => hasObjectPermission(prefix, 'Get');

  const sections = schema ? visibleLayouts(schema, edition, canGet, hasPermission) : [];
  const open = (layout: Layout) => {
    setActiveSection(layout.name);
    const link = schema && sectionLandingLink(schema, layout, edition, canGet, hasPermission);
    if (link) navigate(`/${layout.name}/${link}`);
  };
  return { sections, open };
}

/** The sections as tabs, one click away where the eye already looks. */
function SectionTabs() {
  const { t } = useTranslation();
  const activeSection = useUIStore((s) => s.activeSection);
  const { sections, open } = useSections();
  if (sections.length <= 1) return null;

  return (
    <TooltipProvider delayDuration={150}>
      <div
        className="hidden items-center gap-0.5 rounded-xl bg-muted p-1 sm:flex"
        role="tablist"
        aria-label={t('sections', 'Sections')}
      >
        {sections.map((layout) => {
          const active = layout.name === activeSection;
          return (
            <Tooltip key={layout.name}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={layout.name}
                  onClick={() => open(layout)}
                  className={cn(
                    'flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground lg:px-3',
                    active && 'bg-card text-primary shadow-soft',
                  )}
                >
                  {createElement(iconByName(layout.icon), { className: 'h-4 w-4 shrink-0' })}
                  <span className="hidden lg:inline">{layout.name}</span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{layout.name}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

/** Sections, accounts, the reader's display choices, the source and signing out. */
function AccountMenu() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const palette = useUIStore((s) => s.palette);
  const setPalette = useUIStore((s) => s.setPalette);
  const adminLayout = useUIStore((s) => s.adminLayout);
  const setAdminLayout = useUIStore((s) => s.setAdminLayout);
  const contrast = useUIStore((s) => s.contrast);
  const setContrast = useUIStore((s) => s.setContrast);
  const motion = useUIStore((s) => s.motion);
  const setMotion = useUIStore((s) => s.setMotion);
  const accounts = useAuthStore((s) => s.accounts);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const switchAccount = useAuthStore((s) => s.switchAccount);
  const { sections, open } = useSections();
  const followSystem = t('a11y.followSystem', 'Follow the system');

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={t('userMenu', 'User menu')}>
          <User className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {sections.length > 0 && (
          <>
            <DropdownMenuLabel>{t('sections', 'Sections')}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {sections.map((layout) => {
                const Icon = iconByName(layout.icon);
                return (
                  <DropdownMenuItem key={layout.name} onClick={() => open(layout)}>
                    <Icon className="mr-2 h-4 w-4" />
                    {layout.name}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        {Object.keys(accounts).length > 0 && (
          <>
            <DropdownMenuLabel>{t('accounts', 'Accounts')}</DropdownMenuLabel>
            <DropdownMenuGroup>
              {Object.entries(accounts).map(([id, info]) => (
                <DropdownMenuItem key={id} onClick={() => switchAccount(id)}>
                  {id === activeAccountId && <Check className="mr-2 h-4 w-4" />}
                  <span className={id !== activeAccountId ? 'ml-6' : ''}>{info.name || id}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <LayoutTemplate className="mr-2 h-4 w-4" />
            {t('nav.layoutMenu', 'Layout')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-56">
            <DropdownMenuRadioGroup value={adminLayout} onValueChange={(v) => isAdminLayout(v) && setAdminLayout(v)}>
              <DropdownMenuRadioItem value="modern" className="gap-2">
                {t('nav.layoutModern', 'Modern')}
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="legacy" className="gap-2">
                {t('nav.layoutLegacy', 'Legacy')}
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-[11px] leading-snug text-muted-foreground">
              {adminLayout === 'modern'
                ? t('nav.layoutModernHint', 'Sections across the top; the page gets the full width.')
                : t('nav.layoutLegacyHint', 'The sidebar, as the old web UI had it.')}
            </p>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Palette className="mr-2 h-4 w-4" />
            {t('theme.menu', 'Theme')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-52">
            <DropdownMenuRadioGroup value={palette} onValueChange={(v) => isPaletteId(v) && setPalette(v)}>
              {PALETTES.map((p) => (
                <DropdownMenuRadioItem key={p.id} value={p.id} className="gap-2">
                  <span
                    aria-hidden="true"
                    className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15"
                    style={{ background: theme === 'dark' ? p.swatch[1] : p.swatch[0] }}
                  />
                  <span className="notranslate" translate="no">
                    {p.id === 'default' ? t('theme.classic', 'Classic') : p.name}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Accessibility className="mr-2 h-4 w-4" />
            {t('a11y.menu', 'Accessibility')}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60">
            <DropdownMenuLabel>{t('a11y.contrast', 'Contrast')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={contrast} onValueChange={(v) => isContrastPref(v) && setContrast(v)}>
              <DropdownMenuRadioItem value="system">{followSystem}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="standard">{t('a11y.contrastStandard', 'Standard')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="high">{t('a11y.contrastHigh', 'High')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t('a11y.motion', 'Motion')}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={motion} onValueChange={(v) => isMotionPref(v) && setMotion(v)}>
              <DropdownMenuRadioItem value="system">{followSystem}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="reduce">{t('a11y.motionReduce', 'Reduce')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="full">{t('a11y.motionFull', 'Full')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.dispatchEvent(new Event(OPEN_SHORTCUTS))}>
              <Keyboard className="mr-2 h-4 w-4" />
              {t('a11y.shortcuts', 'Keyboard shortcuts')}
              <span aria-hidden="true" className="ml-auto font-mono text-xs text-muted-foreground">
                ?
              </span>
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            <FileCode className="mr-2 h-4 w-4" />
            {t('source.menu', 'Source code (AGPL-3.0)')}
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />

        <DropdownMenuItem onClick={() => signOut(navigate)}>
          <LogOut className="mr-2 h-4 w-4" />
          {t('logout', 'Logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The bar across the top: menu button on a phone, logo, the command bar, sections, theme and the account menu. */
export function TopBar() {
  const { t } = useTranslation();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Ctrl+K / ⌘K toggles the command bar; `/` and other callers ask for it by event.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isCommandBarKey(e)) return;
      e.preventDefault();
      setPaletteOpen((open) => !open);
    };
    const open = () => setPaletteOpen(true);
    document.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_COMMAND_BAR, open);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_COMMAND_BAR, open);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b bg-background px-4">
      <Button variant="ghost" size="icon" onClick={toggleSidebar} className="md:hidden">
        <Menu className="h-4 w-4" />
      </Button>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Link to="/" className="flex shrink-0 items-center">
              <Logo />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {t('version.label', 'inbuxa Admin {{version}}', { version: __APP_VERSION__ })}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="hidden min-w-0 flex-1 items-center justify-center px-4 md:flex">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-input bg-transparent px-3 text-sm text-muted-foreground shadow-sm transition-colors hover:bg-accent"
        >
          <Search className="h-4 w-4" />
          <span className="flex-1 text-left">
            {t('globalSearch.placeholderActions', 'Search pages and settings, or run an action...')}
          </span>
          <kbd className="pointer-events-none flex h-5 select-none items-center rounded border bg-muted px-1.5 font-mono text-[10px] font-medium">
            {IS_MAC ? '⌘K' : 'Ctrl K'}
          </kbd>
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2 md:ml-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setPaletteOpen(true)}
          aria-label={t('search', 'Search')}
        >
          <Search className="h-4 w-4" />
        </Button>

        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <SectionTabs />

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t('toggleTheme', 'Toggle theme')}>
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <AccountMenu />
      </div>
    </header>
  );
}
