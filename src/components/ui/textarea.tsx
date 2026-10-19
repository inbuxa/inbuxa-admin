/*
 * SPDX-FileCopyrightText: 2023 shadcn
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: MIT
 */

// Structure from shadcn/ui 4.21.1 (MIT), styled for inbuxa.

import * as React from 'react';

import { cn } from '@/lib/utils';
import { fieldClasses } from '@/components/ui/fieldClasses';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea data-slot="textarea" className={cn(fieldClasses, 'flex min-h-[60px] px-3 py-2', className)} {...props} />
  );
}

export { Textarea };
