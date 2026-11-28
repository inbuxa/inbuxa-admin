/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: what the server count sends, in one paragraph, the same on its
 * page and on the one-time question on Settings › Overview.
 */

import { useTranslation } from 'react-i18next';

export function CountExplanation() {
  const { t } = useTranslation();
  return (
    <p className="text-sm text-muted-foreground">
      {t(
        'serverCount.explanation',
        'This is off unless you turn it on. Once a week, this server sends a random ID and its version number, and nothing else. Our collector works out the country from the request and does not keep the address. Turning it off deletes the ID here and asks the collector to forget it.',
      )}
    </p>
  );
}
