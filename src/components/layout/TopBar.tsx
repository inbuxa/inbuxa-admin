/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as LucideIcons from 'lucide-react';
const { Sun, Moon, User, LogOut, Check, Menu, Search, FileCode, Palette, LayoutTemplate } = LucideIcons;
import { Button } from '@/components/ui/button';
import { CommandPalette } from '@/components/common/CommandPalette';
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
import { isPaletteId, PALETTES } from '@/lib/palettes';
import Logo from '@/components/common/Logo';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { EnterpriseUpsell } from '@/components/common/EnterpriseUpsell';
import { SOURCE_URL } from '@/lib/sourceDownload';
import { visibleLayouts } from '@/lib/layout';
import { sectionLandingLink } from '@/lib/lastVisited';
import { cn } from '@/lib/utils';
import { isAdminLayout, useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { signOut } from '@/services/auth/signOut';
import { createElement, useEffect, useState } from 'react';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';

const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.userAgent);

function getIcon(name: string): LucideIcons.LucideIcon {
  const formatted = name
    .split('-')
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
  return ((LucideIcons as Record<string, unknown>)[formatted] as LucideIcons.LucideIcon) || LucideIcons.Circle;
}

export function TopBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  const palette = useUIStore((s) => s.palette);
  const setPalette = useUIStore((s) => s.setPalette);
  const adminLayout = useUIStore((s) => s.adminLayout);
  const setAdminLayout = useUIStore((s) => s.setAdminLayout);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const activeSection = useUIStore((s) => s.activeSection);
  const accounts = useAuthStore((s) => s.accounts);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const switchAccount = useAuthStore((s) => s.switchAccount);
  const edition = useAccountStore((s) => s.edition);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const schema = useSchemaStore((s) => s.schema);
  const [upsellOpen, setUpsellOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    }
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => document.removeEventListener('keydown', handleGlobalKeyDown);
  }, []);

  const navigableLayouts = schema
    ? visibleLayouts(schema, edition, (prefix) => hasObjectPermission(prefix, 'Get'), hasPermission)
    : [];

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
        {edition !== 'enterprise' && <EnterpriseUpsell open={upsellOpen} onClose={() => setUpsellOpen(false)} />}

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

        {/* INBUXA: the three areas, one click away, where the eye already looks. */}
        {schema && navigableLayouts.length > 1 && (
          <TooltipProvider delayDuration={150}>
            <div
              className="hidden items-center gap-0.5 rounded-xl bg-muted p-1 sm:flex"
              role="tablist"
              aria-label={t('sections', 'Sections')}
            >
              {navigableLayouts.map((layout) => {
                const isActive = layout.name === activeSection;
                return (
                  <Tooltip key={layout.name}>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={isActive}
                        aria-label={layout.name}
                        onClick={() => {
                          setActiveSection(layout.name);
                          const canGet = (prefix: string) => hasObjectPermission(prefix, 'Get');
                          const firstLink = sectionLandingLink(schema, layout, edition, canGet, hasPermission);
                          if (firstLink) navigate(`/${layout.name}/${firstLink}`);
                        }}
                        className={cn(
                          'flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground lg:px-3',
                          isActive && 'bg-card text-primary shadow-soft',
                        )}
                      >
                        {createElement(getIcon(layout.icon), { className: 'h-4 w-4 shrink-0' })}
                        <span className="hidden lg:inline">{layout.name}</span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{layout.name}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        )}

        <Button variant="ghost" size="icon" onClick={toggleTheme} aria-label={t('toggleTheme', 'Toggle theme')}>
          {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('userMenu', 'User menu')}>
              <User className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {schema && navigableLayouts.length > 0 && (
              <>
                <DropdownMenuLabel>{t('sections', 'Sections')}</DropdownMenuLabel>
                <DropdownMenuGroup>
                  {navigableLayouts.map((layout) => {
                    const Icon = getIcon(layout.icon);
                    return (
                      <DropdownMenuItem
                        key={layout.name}
                        onClick={() => {
                          setActiveSection(layout.name);
                          const canGet = (prefix: string) => hasObjectPermission(prefix, 'Get');
                          const firstLink = sectionLandingLink(schema, layout, edition, canGet, hasPermission);
                          if (firstLink) {
                            navigate(`/${layout.name}/${firstLink}`);
                          }
                        }}
                      >
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

            {/* INBUXA: the shell is the reader's choice, the way the palette is. */}
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <LayoutTemplate className="mr-2 h-4 w-4" />
                {t('nav.layoutMenu', 'Layout')}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-56">
                <DropdownMenuRadioGroup
                  value={adminLayout}
                  onValueChange={(v) => isAdminLayout(v) && setAdminLayout(v)}
                >
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

            {/* INBUXA: the same palettes as INBUXA webmail. */}
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
      </div>
    </header>
  );
}
