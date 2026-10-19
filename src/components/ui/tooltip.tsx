/*
 * SPDX-FileCopyrightText: 2023 shadcn
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: MIT
 */

// Structure from shadcn/ui 4.21.1 (MIT), styled for inbuxa.

import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import { cn } from '@/lib/utils';

function TooltipProvider(props: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider data-slot="tooltip-provider" {...props} />;
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />;
}

function TooltipTrigger(props: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />;
}

function TooltipContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-balance text-primary-foreground',
          'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
