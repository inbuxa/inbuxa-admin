/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { useToast, type ToastVariant } from '@/hooks/use-toast';

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'bg-background text-foreground',
  destructive: 'border-destructive bg-destructive text-destructive-foreground',
  success: 'border-green-500 bg-background text-foreground',
  warning: 'border-yellow-500 bg-background text-foreground',
  info: 'border-blue-500 bg-background text-foreground',
};

/** Shows the toasts raised with `toast()`: top of the screen on phones, bottom right otherwise. */
export function Toaster() {
  const { toasts, dismiss } = useToast();
  return (
    <ol
      data-slot="toaster"
      className="pointer-events-none fixed top-0 z-[100] flex max-h-screen w-full flex-col-reverse p-4 sm:bottom-0 sm:right-0 sm:top-auto sm:flex-col md:max-w-[420px]"
    >
      {toasts.map(({ id, title, description, variant = 'default' }) => {
        const loud = variant === 'destructive';
        return (
          <li
            key={id}
            data-slot="toast"
            data-variant={variant}
            data-state="open"
            className={cn(
              'pointer-events-auto relative flex w-full items-center justify-between space-x-2 overflow-hidden rounded-md border p-4 pr-6 shadow-lg transition-all',
              'data-[state=open]:animate-in data-[state=open]:slide-in-from-top-full data-[state=open]:sm:slide-in-from-bottom-full',
              VARIANT_CLASSES[variant],
            )}
          >
            <div className="grid gap-1">
              {title && <div className="text-sm font-semibold [&+div]:text-xs">{title}</div>}
              {description && <div className="text-sm opacity-90">{description}</div>}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => dismiss(id)}
              className={cn(
                'absolute right-1 top-1 rounded-md p-1 transition-colors focus:outline-none focus:ring-1',
                loud
                  ? 'text-red-300 hover:text-red-50 focus:ring-red-400 focus:ring-offset-red-600'
                  : 'text-foreground/60 hover:text-foreground',
              )}
            >
              <X className="size-4" />
            </button>
          </li>
        );
      })}
    </ol>
  );
}
