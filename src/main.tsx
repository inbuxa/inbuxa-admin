/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';

import './i18n';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { getBasePath } from './lib/basePath';
import { loadLogoOnce } from './lib/logoCache';
import { AdminPanel } from './pages/AdminPanel.lazy';
import LoginPage from './pages/LoginPage';
import NotFound from './pages/NotFound';
import OAuthCallback from './pages/OAuthCallback';

/**
 * Applies the saved theme and palette (uiStore, persisted as `inbuxa-ui`)
 * before React draws anything, so the page doesn't flash the wrong colors.
 * With no saved theme, or "system", the system's preference decides.
 */
function applySavedLook() {
  const root = document.documentElement;
  let saved: { theme?: unknown; palette?: unknown } = {};
  try {
    saved = JSON.parse(localStorage.getItem('inbuxa-ui') ?? '{}')?.state ?? {};
  } catch {
    // Unreadable: use the defaults.
  }
  if (typeof saved.palette === 'string' && saved.palette !== 'ihasmail' && /^[a-z-]+$/.test(saved.palette)) {
    root.dataset.palette = saved.palette;
  }
  const dark =
    saved.theme === 'dark' || saved.theme === 'light'
      ? saved.theme === 'dark'
      : !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  root.classList.toggle('dark', dark);
}

applySavedLook();
loadLogoOnce();

const signedIn = (
  <ProtectedRoute>
    <AdminPanel />
  </ProtectedRoute>
);

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      errorElement: <NotFound />,
      children: [
        { path: 'login', element: <LoginPage /> },
        { path: 'oauth/callback', element: <OAuthCallback /> },
        { index: true, element: signedIn },
        { path: ':section/*', element: signedIn },
      ],
    },
  ],
  { basename: getBasePath() },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
