/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

import { ConnectionBanner } from '@/components/layout/ConnectionBanner';
import { ErrorBoundary } from '@/components/layout/ErrorBoundary';
import { MainContent } from '@/components/layout/MainContent';
import { SectionNav } from '@/components/layout/SectionNav';
import { SettingsApplyBanner } from '@/components/layout/SettingsApplyBanner';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { KeyboardShortcuts } from '@/components/common/KeyboardShortcuts';
import { LoadingFallback } from '@/components/common/LoadingFallback';
import { FirstDomainCelebration } from '@/features/celebrate/FirstDomainCelebration';
import { ExplainPanel } from '@/features/ai/explain/ExplainPanel';
import { explainAvailable } from '@/features/ai/explain/explain';
import { useExplainStore } from '@/features/ai/explain/explainStore';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { usePermissions } from '@/hooks/usePermissions';
import { setLocale } from '@/i18n';
import { loadAccountTheme, setAccountSettingsTarget } from '@/lib/accountSettings';
import { rememberLastVisited } from '@/lib/lastVisited';
import { visibleLayouts } from '@/lib/layout';
import { fitsSectionNav } from '@/lib/navTree';
import { cn } from '@/lib/utils';
import { getApiBaseUrl } from '@/services/api';
import { fetchAccountInfo, fetchSchema, fetchSession } from '@/services/jmap/client';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useUIStore } from '@/stores/uiStore';

import { adminPageTitle, landing, parseAdminPath, permissionChecks, readSessionInfo } from './adminRoute';

const BootstrapWizard = lazy(() =>
  import('@/components/bootstrap/BootstrapWizard').then((m) => ({ default: m.BootstrapWizard })),
);

/**
 * A development build may carry an access token, and a refresh token so it
 * renews itself like a real sign-in instead of dying with the access token.
 */
function useDevelopmentToken(accessToken: string | null) {
  useEffect(() => {
    const token = import.meta.env.VITE_ACCESS_TOKEN;
    if (!token || accessToken) return;
    const refresh = (import.meta.env.VITE_REFRESH_TOKEN as string | undefined) ?? '';
    const expiresIn = Number(import.meta.env.VITE_ACCESS_TOKEN_EXPIRES_IN ?? 86400);
    useAuthStore.getState().setTokens(token, refresh, expiresIn, refresh ? `${getApiBaseUrl()}/auth/token` : '');
  }, [accessToken]);
}

/** The console after sign-in: loads the session, schema and account once, then draws the shell around the page. */
export default function AdminPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { section, '*': splat } = useParams<{ section?: string; '*'?: string }>();
  const { viewName, id } = parseAdminPath(splat, useSchemaStore.getState().schema?.objects);

  const isSchemaLoaded = useSchemaStore((s) => s.isLoaded);
  const schema = useSchemaStore((s) => s.schema);
  const searchIndex = useSchemaStore((s) => s.searchIndex);
  const setSchema = useSchemaStore((s) => s.setSchema);
  const setAccountInfo = useAccountStore((s) => s.setAccountInfo);
  const edition = useAccountStore((s) => s.edition);
  const permissions = useAccountStore((s) => s.permissions);
  const setSession = useAuthStore((s) => s.setSession);
  const accessToken = useAuthStore((s) => s.accessToken);
  const activeAccountId = useAuthStore((s) => s.activeAccountId);
  const activeSection = useUIStore((s) => s.activeSection);
  const setActiveSection = useUIStore((s) => s.setActiveSection);
  const adminLayout = useUIStore((s) => s.adminLayout);
  const sidebarOpen = useUIStore((s) => s.sidebarOpen);
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed);
  const { canViewObject } = usePermissions();

  const [initError, setInitError] = useState<string | null>(null);
  const [initializing, setInitializing] = useState(!isSchemaLoaded);

  useDocumentTitle(
    useMemo(
      () => adminPageTitle(t, { section, viewName, id, searchIndex, dashboards: schema?.dashboards }),
      [section, viewName, id, searchIndex, schema, t],
    ),
  );
  useDevelopmentToken(accessToken);

  useEffect(() => {
    if (isSchemaLoaded) return;
    let cancelled = false;

    (async () => {
      try {
        const session = await fetchSession();
        const info = readSessionInfo(session);
        if (cancelled) return;
        setSession(info.accounts, info.primaryAccountId, info.apiUrl, info.maxObjectsInGet, info.maxObjectsInSet);
        useExplainStore.getState().setAvailable(explainAvailable(session, info.primaryAccountId));
        useAuthStore.getState().setUsername(typeof session.username === 'string' ? session.username : null);
        // The theme lives with the account, shared with the webmail.
        setAccountSettingsTarget(session);
        void loadAccountTheme().then((stored) => {
          if (stored && !cancelled) useUIStore.getState().applyAccountTheme(stored.palette, stored.mode);
        });

        const [schemaData, account] = await Promise.all([fetchSchema(), fetchAccountInfo()]);
        if (cancelled) return;
        setSchema(schemaData);
        setAccountInfo(account.permissions, account.edition, account.locale);
        setLocale(account.locale);
        setInitializing(false);
      } catch (err) {
        if (cancelled) return;
        console.error('Initialization failed:', err);
        setInitError(err instanceof Error ? err.message : t('errors.unexpectedError'));
        setInitializing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isSchemaLoaded, setSession, setSchema, setAccountInfo, t]);

  const layouts = useMemo(() => {
    if (!schema) return [];
    const { canGet, hasPerm } = permissionChecks(permissions);
    return visibleLayouts(schema, edition, canGet, hasPerm);
  }, [schema, edition, permissions]);

  // A layout with too many top-level groups for a menu bar keeps the sidebar
  // whatever the reader chose, so Settings never turns into nineteen dropdowns.
  const currentLayout = useMemo(() => {
    const name = (section ?? activeSection ?? '').toLowerCase();
    return layouts.find((l) => l.name.toLowerCase() === name) ?? null;
  }, [layouts, section, activeSection]);
  const useSectionNav = adminLayout === 'modern' && currentLayout !== null && fitsSectionNav(currentLayout, edition);

  // An administrator who may only run the first-boot setup sees no layout at all.
  const isBootstrapMode = schema !== null && canViewObject('x:Bootstrap') && layouts.length === 0;

  useEffect(() => {
    if (!schema || isBootstrapMode) return;
    const next = landing(schema, edition, permissions, section, viewName);
    if (!next) return;
    setActiveSection(next.section);
    if (next.kind === 'redirect') {
      if (next.link) navigate(`/${next.section}/${next.link}`, { replace: true });
    } else if (next.remember) {
      rememberLastVisited(next.remember.section, next.remember.viewName);
    }
  }, [section, viewName, schema, setActiveSection, navigate, edition, permissions, isBootstrapMode]);

  if (initializing) return <LoadingFallback fullScreen />;

  if (initError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive">{t('errors.loadSchemaFailed')}</h2>
          <p className="mt-2 text-muted-foreground">{initError}</p>
          <button
            className="mt-4 rounded bg-primary px-4 py-2 text-primary-foreground hover:opacity-90"
            onClick={() => window.location.reload()}
          >
            {t('common.continue')}
          </button>
        </div>
      </div>
    );
  }

  if (!schema) return null;

  if (isBootstrapMode) {
    return (
      <ErrorBoundary>
        <Suspense fallback={<LoadingFallback fullScreen />}>
          <BootstrapWizard />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="skip-link">
        {t('a11y.skip', 'Skip to content')}
      </a>
      <KeyboardShortcuts />
      <FirstDomainCelebration />
      <TopBar />
      {useSectionNav && currentLayout && <SectionNav layout={currentLayout} />}
      <div className="flex flex-1">
        <Sidebar mobileOnly={useSectionNav} />
        <main
          id="main"
          tabIndex={-1}
          className={cn(
            'flex-1 overflow-auto bg-content-background p-6 transition-[margin] focus:outline-none',
            !useSectionNav && sidebarOpen && (sidebarCollapsed ? 'md:ml-[4.5rem]' : 'md:ml-64'),
          )}
        >
          <ConnectionBanner />
          <SettingsApplyBanner />
          <ErrorBoundary key={activeAccountId ?? 'none'}>
            <MainContent viewName={viewName} id={id} section={section} />
          </ErrorBoundary>
        </main>
      </div>
      <ExplainPanel />
    </div>
  );
}
