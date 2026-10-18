/*
 * SPDX-FileCopyrightText: 2023 shadcn
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: MIT
 */

// Built like shadcn/ui's combobox example (MIT): a popover over a command
// list. The props are the console's own, kept so no caller changes.

import { useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export interface ComboboxOption {
  value: string;
  label: string;
  /** A second, quieter line under the label. */
  description?: string;
  /** Shown before the label, in the list and on the button. */
  marker?: ReactNode;
  /** More words the search matches, besides the label. */
  keywords?: string[];
}

interface ComboboxProps {
  options: ComboboxOption[];
  /** The chosen option's value; '' for none. */
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  /** Offers a first row that clears the choice (sends ''). */
  nullable?: boolean;
  nullLabel?: string;
  /** Called the first time the list opens, to load options lazily. */
  onFirstOpen?: () => void;
}

/** cmdk matches on item values; this one can't collide with an option's. */
const NONE = '\u0000none';

/** A button that opens a searchable list of options and shows the one chosen. */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchPlaceholder = 'Search...',
  emptyText = 'No matches.',
  disabled,
  className,
  contentClassName,
  nullable,
  nullLabel = 'None',
  onFirstOpen,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const opened = useRef(false);
  const chosen = options.find((o) => o.value === value);

  const toggle = (next: boolean) => {
    if (next && !opened.current) {
      opened.current = true;
      onFirstOpen?.();
    }
    setOpen(next);
  };
  const choose = (next: string) => {
    onValueChange(next);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={toggle}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !chosen && 'text-muted-foreground', className)}
        >
          <span className="flex items-center gap-2 truncate">
            {chosen?.marker}
            {chosen ? chosen.label : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-(--radix-popover-trigger-width) p-0', contentClassName)}>
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {nullable && (
                <CommandItem value={NONE} keywords={[nullLabel]} onSelect={() => choose('')}>
                  <X className="mr-2 size-4 opacity-50" />
                  <span className="text-muted-foreground">{nullLabel}</span>
                </CommandItem>
              )}
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={o.value}
                  keywords={[o.label, ...(o.keywords ?? [])]}
                  onSelect={() => choose(o.value)}
                >
                  <Check className={cn('mr-2 size-4', o.value !== value && 'opacity-0')} />
                  <span className="flex flex-1 items-center gap-2 truncate">
                    {o.marker}
                    <span className="flex flex-col truncate">
                      <span className="truncate">{o.label}</span>
                      {o.description && <span className="truncate text-xs text-muted-foreground">{o.description}</span>}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
