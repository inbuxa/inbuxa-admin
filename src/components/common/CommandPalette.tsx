/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LogOut, Route, SunMoon, Wand2, Zap } from 'lucide-react';

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { CertificateLaunchChoice } from '@/features/certificates/CertificateSetupCard';
import { buildCommands, matchCommands, type LaunchJob, type PaletteCommand } from '@/features/commands/commands';
import { DirectoryLaunchChoice } from '@/features/directory/DirectorySetupCard';
import { LimitsLaunchChoice } from '@/features/limits/LimitsSummary';
import { SendingLaunchChoice } from '@/features/sending/SendingSetupCard';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { friendlyName, getActionInfo, getObjectKind } from '@/lib/globalSearch';
import { signOut } from '@/services/auth/signOut';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore, type SearchIndexEntry } from '@/stores/schemaStore';
import { useUIStore } from '@/stores/uiStore';

import { commandRow, entryRow, paletteRows } from './paletteRows';

const COMMAND_ICONS: Record<PaletteCommand['icon'], typeof Zap> = {
  action: Zap,
  guide: Wand2,
  trace: Route,
  theme: SunMoon,
  signOut: LogOut,
};

const LIST_CLASSES =
  '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The command bar: commands (server actions, guided setups, a delivery
 * trace, the theme, signing out) above the pages, sections and fields that
 * match what's typed.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { query, setQuery, debouncedQuery, groups, selectEntry, reset, schema } = useGlobalSearch(close);
  const searchIndex = useSchemaStore((s) => s.searchIndex);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  // A guided setup chosen here still asks "Guided or manual?" first.
  const [launch, setLaunch] = useState<LaunchJob | null>(null);

  const context = useMemo(
    () => (schema ? { schema, searchIndex, viewToSection, hasPermission, hasObjectPermission, theme, t } : null),
    [schema, searchIndex, viewToSection, hasPermission, hasObjectPermission, theme, t],
  );
  const allCommands = useMemo(() => (context ? buildCommands(context) : []), [context]);
  const commands = useMemo(
    () => (context ? matchCommands(allCommands, debouncedQuery, context) : []),
    [allCommands, debouncedQuery, context],
  );

  // The highlighted row goes back to the first whenever the rows change. Left
  // to itself, cmdk keeps the old row's value after a new query, and once that
  // row is gone Enter picks nothing.
  const rows = useMemo(() => paletteRows(commands, groups), [commands, groups]);
  const rowsKey = rows.join('\n');
  const [selected, setSelected] = useState(rows[0] ?? '');
  const [selectedFor, setSelectedFor] = useState(rowsKey);
  if (selectedFor !== rowsKey) {
    setSelectedFor(rowsKey);
    setSelected(rows[0] ?? '');
  }

  const run = (command: PaletteCommand) => {
    close();
    switch (command.kind.type) {
      case 'navigate':
        navigate(command.kind.to);
        break;
      case 'launch':
        setLaunch(command.kind.job);
        break;
      case 'theme':
        toggleTheme();
        break;
      case 'signOut':
        signOut(navigate);
        break;
    }
  };
  const launchProps = (job: LaunchJob) => ({
    open: launch === job,
    onOpenChange: (isOpen: boolean) => {
      if (!isOpen) setLaunch(null);
    },
  });

  const groupLabels: Record<SearchIndexEntry['type'], string> = {
    link: t('globalSearch.pages', 'Pages'),
    form: t('globalSearch.formSections', 'Form Sections'),
    field: t('globalSearch.fields', 'Fields'),
  };

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">{t('globalSearch.title', 'Search')}</DialogTitle>
          <Command shouldFilter={false} value={selected} onValueChange={setSelected} loop className={LIST_CLASSES}>
            <CommandInput
              placeholder={t('globalSearch.placeholderActions', 'Search pages and settings, or run an action...')}
              value={query}
              onValueChange={setQuery}
              trailing={
                <kbd className="pointer-events-none ml-2 inline-flex h-5 shrink-0 select-none items-center rounded-md border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
                  ESC
                </kbd>
              }
            />
            <CommandList>
              <CommandEmpty>
                {debouncedQuery.trim()
                  ? t('globalSearch.noResults', 'No results found.')
                  : t('globalSearch.typeToSearch', 'Type to search the admin panel.')}
              </CommandEmpty>
              {commands.length > 0 && (
                <CommandGroup heading={t('globalSearch.actions', 'Actions')}>
                  {commands.map((command) => {
                    const Icon = COMMAND_ICONS[command.icon];
                    return (
                      <CommandItem key={command.id} value={commandRow(command)} onSelect={() => run(command)}>
                        <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex flex-1 flex-col overflow-hidden">
                          <span className="truncate font-medium">{command.label}</span>
                          <span className="truncate text-xs text-muted-foreground">{command.hint}</span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
              {[...groups].map(([type, entries]) => (
                <CommandGroup key={type} heading={groupLabels[type]}>
                  {entries.map((entry, i) => {
                    const kind = schema ? getObjectKind(schema, entry.viewName) : null;
                    const { label, Icon } = getActionInfo(entry.type, kind, t);
                    const value = entryRow(type, i, entry.viewName);
                    return (
                      <CommandItem key={value} value={value} onSelect={() => selectEntry(entry)}>
                        <Icon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex flex-1 flex-col overflow-hidden">
                          <span className="truncate font-medium">{friendlyName(entry.text)}</span>
                          <span className="truncate text-xs text-muted-foreground">{entry.breadcrumb}</span>
                        </div>
                        <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{label}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </DialogContent>
      </Dialog>
      <SendingLaunchChoice {...launchProps('sending')} />
      <LimitsLaunchChoice {...launchProps('limits')} />
      <DirectoryLaunchChoice {...launchProps('directory')} />
      <CertificateLaunchChoice {...launchProps('certificates')} />
    </>
  );
}
