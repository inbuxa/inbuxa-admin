/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useAuthStore } from '@/stores/authStore';

/**
 * Shows its children to a signed-in admin; anyone else goes to the sign-in
 * page, which brings them back here afterwards. A development build with
 * VITE_ACCESS_TOKEN set counts as signed in.
 */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const signedIn = useAuthStore((s) => s.isAuthenticated()) || !!import.meta.env.VITE_ACCESS_TOKEN;
  const { pathname, search } = useLocation();
  if (signedIn) return children;
  return <Navigate to="/login" replace state={{ from: pathname + search }} />;
}
