/*
 * SPDX-FileCopyrightText: 2023 shadcn
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: MIT
 */

// Structure from shadcn/ui 4.21.1 (MIT), styled for inbuxa.

import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { DayPicker, getDefaultClassNames, type DayButton } from '@daypicker/react';

import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';

const navButton = cn(
  buttonVariants({ variant: 'ghost' }),
  'size-(--cell-size) p-0 select-none aria-disabled:opacity-50',
);

/**
 * A month grid for picking one day. The console only picks single dates (the
 * date field), so only that is styled: no ranges, week numbers or month and
 * year dropdowns.
 */
function Calendar({
  className,
  classNames,
  components,
  showOutsideDays = true,
  ...props
}: React.ComponentProps<typeof DayPicker>) {
  const base = getDefaultClassNames();
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        'group/calendar bg-background p-3 [--cell-size:--spacing(8)] [[data-slot=popover-content]_&]:bg-transparent',
        className,
      )}
      classNames={{
        root: cn('w-fit', base.root),
        months: cn('relative flex flex-col gap-4 md:flex-row', base.months),
        month: cn('flex w-full flex-col gap-4', base.month),
        nav: cn('absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1', base.nav),
        button_previous: cn(navButton, base.button_previous),
        button_next: cn(navButton, base.button_next),
        month_caption: cn(
          'flex h-(--cell-size) w-full items-center justify-center px-(--cell-size)',
          base.month_caption,
        ),
        caption_label: cn('text-sm font-medium select-none', base.caption_label),
        month_grid: cn('w-full border-collapse', base.month_grid),
        weekdays: cn('flex', base.weekdays),
        weekday: cn('flex-1 rounded-md text-[0.8rem] font-normal text-muted-foreground select-none', base.weekday),
        week: cn('mt-2 flex w-full', base.week),
        day: cn('group/day relative aspect-square size-full p-0 text-center select-none', base.day),
        today: cn('rounded-md bg-accent text-accent-foreground', base.today),
        outside: cn('text-muted-foreground aria-selected:text-muted-foreground', base.outside),
        disabled: cn('text-muted-foreground opacity-50', base.disabled),
        hidden: cn('invisible', base.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...rest }) => (
          <div data-slot="calendar" ref={rootRef} className={className} {...rest} />
        ),
        Chevron: ({ className, orientation, ...rest }) => {
          const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
          return <Icon className={cn('size-4', className)} {...rest} />;
        },
        DayButton: CalendarDayButton,
        ...components,
      }}
      {...props}
    />
  );
}

function CalendarDayButton({ className, day, modifiers, ...props }: React.ComponentProps<typeof DayButton>) {
  const ref = React.useRef<HTMLButtonElement>(null);
  // Keyboard moves focus between days by re-rendering; follow it.
  React.useEffect(() => {
    if (modifiers.focused) ref.current?.focus();
  }, [modifiers.focused]);

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString()}
      data-selected-single={modifiers.selected}
      className={cn(
        'flex aspect-square size-auto w-full min-w-(--cell-size) flex-col gap-1 leading-none font-normal dark:hover:text-accent-foreground',
        'group-data-[focused=true]/day:relative group-data-[focused=true]/day:z-10 group-data-[focused=true]/day:border-ring group-data-[focused=true]/day:ring-[3px] group-data-[focused=true]/day:ring-ring/50',
        'data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground',
        getDefaultClassNames().day,
        className,
      )}
      {...props}
    />
  );
}

export { Calendar };
