/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { LogOut, Route, SunMoon, Wand2, Zap } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { friendlyName, getActionInfo, getObjectKind, useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useSchemaStore, type SearchIndexEntry } from '@/stores/schemaStore';
import { useAccountStore } from '@/stores/accountStore';
import { useUIStore } from '@/stores/uiStore';
import { signOut } from '@/services/auth/signOut';
import { buildCommands, matchCommands, type LaunchJob, type PaletteCommand } from '@/features/commands/commands';
import { SendingLaunchChoice } from '@/features/sending/SendingSetupCard';
import { LimitsLaunchChoice } from '@/features/limits/LimitsSummary';
import { DirectoryLaunchChoice } from '@/features/directory/DirectorySetupCard';
import { CertificateLaunchChoice } from '@/features/certificates/CertificateSetupCard';

const COMMAND_ICONS: Record<PaletteCommand['icon'], typeof Zap> = {
  action: Zap,
  guide: Wand2,
  trace: Route,
  theme: SunMoon,
  signOut: LogOut,
};

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation();
  const closePalette = useCallback(() => onOpenChange(false), [onOpenChange]);
  const { query, setQuery, debouncedQuery, groups, selectEntry, reset, schema } = useGlobalSearch(closePalette);
  const navigate = useNavigate();
  const searchIndex = useSchemaStore((s) => s.searchIndex);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const hasPermission = useAccountStore((s) => s.hasPermission);
  const hasObjectPermission = useAccountStore((s) => s.hasObjectPermission);
  const theme = useUIStore((s) => s.theme);
  const toggleTheme = useUIStore((s) => s.toggleTheme);
  // inbuxa: a guided setup chosen here still asks "Guided or manual?" first.
  const [launch, setLaunch] = useState<LaunchJob | null>(null);

  // inbuxa: commands (server actions, guided setups, a delivery trace, theme, sign out) beside the pages.
  const commandContext = useMemo(
    () => (schema ? { schema, searchIndex, viewToSection, hasPermission, hasObjectPermission, theme, t } : null),
    [schema, searchIndex, viewToSection, hasPermission, hasObjectPermission, theme, t],
  );
  const allCommands = useMemo(() => (commandContext ? buildCommands(commandContext) : []), [commandContext]);
  const commands = useMemo(
    () => (commandContext ? matchCommands(allCommands, debouncedQuery, commandContext) : []),
    [allCommands, debouncedQuery, commandContext],
  );

  // inbuxa: the highlighted row, back on the first result whenever the results
  // change. Left to itself, cmdk keeps the old row's value after a new query,
  // and once that row is gone Enter picks nothing.
  const rowValues = useMemo(() => {
    const values = commands.map((c) => `command-${c.id}`);
    for (const [type, entries] of groups) {
      entries.forEach((entry, idx) => values.push(`${type}-${idx}-${entry.viewName}`));
    }
    return values;
  }, [commands, groups]);
  const rowsKey = rowValues.join('\n');
  const [selected, setSelected] = useState(rowValues[0] ?? '');
  const [selectedFor, setSelectedFor] = useState(rowsKey);
  if (selectedFor !== rowsKey) {
    setSelectedFor(rowsKey);
    setSelected(rowValues[0] ?? '');
  }

  const runCommand = useCallback(
    (command: PaletteCommand) => {
      closePalette();
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
    },
    [closePalette, navigate, toggleTheme],
  );
  const launchProps = (job: LaunchJob) => ({
    open: launch === job,
    onOpenChange: (open: boolean) => {
      if (!open) setLaunch(null);
    },
  });

  const groupLabels: Record<SearchIndexEntry['type'], string> = useMemo(
    () => ({
      link: t('globalSearch.pages', 'Pages'),
      form: t('globalSearch.formSections', 'Form Sections'),
      field: t('globalSearch.fields', 'Fields'),
    }),
    [t],
  );

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0" showCloseButton={false}>
          <DialogTitle className="sr-only">{t('globalSearch.title', 'Search')}</DialogTitle>
          <Command
            shouldFilter={false}
            value={selected}
            onValueChange={setSelected}
            loop
            className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]:not([hidden])_~[cmdk-group]]:pt-0 [&_[cmdk-input-wrapper]_svg]:h-5 [&_[cmdk-input-wrapper]_svg]:w-5 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-3 [&_[cmdk-item]_svg]:h-5 [&_[cmdk-item]_svg]:w-5"
          >
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
                      <CommandItem
                        key={command.id}
                        value={`command-${command.id}`}
                        onSelect={() => runCommand(command)}
                      >
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
              {Array.from(groups.entries()).map(([type, entries]) => (
                <CommandGroup key={type} heading={groupLabels[type]}>
                  {entries.map((entry, idx) => {
                    const objectKind = schema ? getObjectKind(schema, entry.viewName) : null;
                    const { label: actionLabel, Icon: ActionIcon } = getActionInfo(entry.type, objectKind, t);
                    const itemValue = `${type}-${idx}-${entry.viewName}`;

                    return (
                      <CommandItem key={itemValue} value={itemValue} onSelect={() => selectEntry(entry)}>
                        <ActionIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
                        <div className="flex flex-1 flex-col overflow-hidden">
                          <span className="truncate font-medium">{friendlyName(entry.text)}</span>
                          <span className="truncate text-xs text-muted-foreground">{entry.breadcrumb}</span>
                        </div>
                        <span className="ml-auto shrink-0 pl-2 text-xs text-muted-foreground">{actionLabel}</span>
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
