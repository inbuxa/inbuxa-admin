/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { useTranslation } from 'react-i18next';
import { SOURCE_URL } from '@/lib/sourceDownload';

/**
 * The AGPL's offer to everyone using this interface over the network: where
 * the source is, with the running version named beside it.
 */
export function SourceLink({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className={className}>
      {t('source.download', 'Source code ({{version}}), AGPL-3.0', { version: __APP_VERSION__ })}
    </a>
  );
}
