/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 *
 * Modified by Coffey Labs in 2026 for INBUXA.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './i18n';
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';
import './index.css';
import App from './App';
import LoginPage from './pages/LoginPage';
import OAuthCallback from './pages/OAuthCallback';
import NotFound from './pages/NotFound';
import { AdminPanel } from './pages/AdminPanel.lazy';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import { getBasePath } from './lib/basePath';
import { loadLogoOnce } from './lib/logoCache';

(() => {
  try {
    const persisted = localStorage.getItem('inbuxa-ui');
    if (persisted) {
      const parsed = JSON.parse(persisted);
      const theme = parsed?.state?.theme;
      // INBUXA: the palette too, before the first paint, so it doesn't flash.
      const palette = parsed?.state?.palette;
      if (typeof palette === 'string' && palette !== 'ihasmail' && /^[a-z-]+$/.test(palette)) {
        document.documentElement.dataset.palette = palette;
      }
      if (theme === 'dark' || theme === 'light') {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        return;
      }
    }
    // eslint-disable-next-line no-empty
  } catch {}
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.classList.toggle('dark', !!prefersDark);
})();

loadLogoOnce();

const basePath = getBasePath();

const router = createBrowserRouter(
  [
    {
      path: '/',
      element: <App />,
      errorElement: <NotFound />,
      children: [
        { path: 'login', element: <LoginPage /> },
        { path: 'oauth/callback', element: <OAuthCallback /> },
        {
          path: ':section/*',
          element: (
            <ProtectedRoute>
              <AdminPanel />
            </ProtectedRoute>
          ),
        },
        {
          index: true,
          element: (
            <ProtectedRoute>
              <AdminPanel />
            </ProtectedRoute>
          ),
        },
      ],
    },
  ],
  { basename: basePath },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
