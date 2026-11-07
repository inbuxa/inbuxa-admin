/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { CheckCircle2, CircleDashed, Loader2, XCircle } from 'lucide-react';
import type { Check } from './shared';

export function StateIcon({ state }: { state: Check['state'] }) {
  if (state === 'ok') return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />;
  if (state === 'checking') return <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />;
  if (state === 'error') return <CircleDashed className="h-4 w-4 shrink-0 text-muted-foreground" />;
  return <XCircle className="h-4 w-4 shrink-0 text-destructive" />;
}
