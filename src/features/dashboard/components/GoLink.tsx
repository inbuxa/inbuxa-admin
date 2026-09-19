/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight } from 'lucide-react';
import { hrefFor, useDashLink } from '../links';

/** "Open the queue ↗": the way from a chart to the page it's about. */
export function GoLink({ metrics }: { metrics: string[] }) {
  const { t } = useTranslation();
  const link = useDashLink(metrics);
  if (!link) return null;
  return (
    <Link
      to={hrefFor(link)}
      className="ml-auto inline-flex shrink-0 items-center gap-1 text-sm font-medium text-primary hover:underline"
    >
      {t(`dashLink.${link.viewName}`, link.label)}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </Link>
  );
}
