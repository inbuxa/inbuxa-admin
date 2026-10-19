/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Search, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useNoPermissionMessage, useObjectLabel, useObjectList } from '@/lib/objectOptions';
import type { Schema } from '@/types/schema';

interface ObjectPickerProps {
  schema: Schema;
  objectName: string;
  value: string;
  onChange: (id: string) => void;
  onClear?: () => void;
  placeholder?: string;
}

/**
 * One object chosen by searching a list of them, shown as a chip with its
 * name. The list loads the first time it opens; without permission to read
 * the objects, the search button only says why it can't open.
 */
export function ObjectPicker({ schema, objectName, value, onChange, onClear, placeholder }: ObjectPickerProps) {
  const { t } = useTranslation();
  const list = useObjectList(objectName, schema);
  const listed = list.options.find((o) => o.id === value)?.label;
  // Looked up on its own only when the list hasn't been loaded or lacks it.
  const looked = useObjectLabel(objectName, listed ? null : value || null, schema);
  const name = listed ?? looked.label ?? value;
  const [open, setOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const noPermission = useNoPermissionMessage(schema, objectName);
  const searchLabel = t('common.search', 'Search');

  const openChange = (next: boolean) => {
    setOpen(next);
    if (next) void list.ensureLoaded();
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {value && (
        <Badge variant="secondary" className="gap-1 pr-1.5 text-sm max-w-xs">
          {looked.loading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <span className="truncate" title={name}>
              {name}
            </span>
          )}
          {onClear && (
            <button
              type="button"
              onClick={onClear}
              className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
              aria-label={t('common.clear', 'Clear')}
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </Badge>
      )}
      {!value && placeholder && <span className="text-sm text-muted-foreground">{placeholder}</span>}
      {noPermission ? (
        <TooltipProvider>
          <Tooltip open={whyOpen} onOpenChange={setWhyOpen}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 cursor-not-allowed opacity-60"
                aria-label={searchLabel}
                aria-disabled="true"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setWhyOpen(true);
                }}
              >
                <Search className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{noPermission}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Popover open={open} onOpenChange={openChange}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={searchLabel}>
              <Search className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="p-0 w-72" align="start">
            <Command>
              <CommandInput placeholder={t('common.searchPlaceholder', 'Search...')} />
              <CommandList>
                {list.loading ? (
                  <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('common.loading', 'Loading...')}
                  </div>
                ) : (
                  <CommandEmpty>{t('common.noResultsDot', 'No results.')}</CommandEmpty>
                )}
                <CommandGroup>
                  {list.options.map((option) => (
                    <CommandItem
                      key={option.id}
                      value={option.id}
                      keywords={[option.label]}
                      onSelect={() => {
                        onChange(option.id);
                        setOpen(false);
                      }}
                    >
                      <span className="truncate" title={option.label}>
                        {option.label}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
