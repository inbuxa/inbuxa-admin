/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';

import { LoadingFallback } from '@/components/common/LoadingFallback';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { Toaster } from '@/components/ui/toaster';

/** Every route renders inside this: a crash screen, a loading screen while pages load, and toasts. */
export default function App() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LoadingFallback fullScreen />}>
        <Outlet />
      </Suspense>
      <Toaster />
    </ErrorBoundary>
  );
}
