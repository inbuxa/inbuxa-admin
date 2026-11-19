/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: Account › Credentials › Passkeys (#250). The same card an
 * administrator sees on Directory › Accounts, for the signed-in account, so
 * anyone who can open the console manages their own passkeys without
 * needing access to the account list.
 */

import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PasskeysPanel } from './PasskeysPanel';

export function OwnPasskeysPage() {
  const accountId = useAuthStore((s) => s.primaryAccountId);
  if (!accountId) return <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" />;
  return <PasskeysPanel accountId={accountId} />;
}
