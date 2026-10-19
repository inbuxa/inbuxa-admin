/*
 * SPDX-FileCopyrightText: 2023 shadcn
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: MIT
 */

// Structure from shadcn/ui 4.21.1 (MIT), styled for inbuxa.

import * as React from 'react';
import * as TabsPrimitive from '@radix-ui/react-tabs';

import { cn } from '@/lib/utils';

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={className} {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'inline-flex h-9 w-fit items-center justify-center rounded-lg bg-muted p-1 text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium whitespace-nowrap transition-all outline-none',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'disabled:pointer-events-none disabled:opacity-50',
        'data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow',
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'mt-2 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
