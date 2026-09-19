/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { IconTile } from '@/components/common/IconTile';

/**
 * The top of every page: the section's tile, a title that says where you are,
 * a line on what it's for, and the page's own actions on the right.
 */
export function PageHeader({
  icon,
  title,
  subtitle,
  leading,
  actions,
}: {
  icon?: string | null;
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pb-1">
      <div className="flex min-w-0 items-center gap-3.5">
        {leading}
        {icon && <IconTile name={icon} size="lg" />}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold leading-tight">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
