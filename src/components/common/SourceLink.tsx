/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { sourceDownloadUrl } from '@/lib/sourceDownload';

/**
 * The AGPL's offer to everyone using this interface over the network: the
 * exact source of the version running, with that version named.
 */
export function SourceLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <a href={sourceDownloadUrl()} download className={className}>
      {t('source.download', 'Source code of this version ({{id}}), AGPL-3.0', { id: __SOURCE_ID__ })}
    </a>
  );
}
