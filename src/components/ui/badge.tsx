/*
 * SPDX-FileCopyrightText: 2023 shadcn
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: MIT
 */

// Structure from shadcn/ui 4.21.1 (MIT), styled for inbuxa.

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '@/lib/utils';

const badgeVariants = cva(
  [
    'inline-flex w-fit shrink-0 items-center gap-1 rounded-md border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap transition-colors',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    '[&>svg]:pointer-events-none [&>svg]:size-3',
  ],
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground shadow [a&]:hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/80',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow [a&]:hover:bg-destructive/80',
        outline: 'text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

function Badge({
  className,
  variant = 'default',
  asChild = false,
  ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span';
  return (
    <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
