/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: keyboard shortcuts (admin UX roadmap, item 13) and the `?` sheet
 * that lists them (item 12). Single keys never fire while typing in a field,
 * with a modifier held, or while a dialog is open.
 */

import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useSchemaStore } from '@/stores/schemaStore';
import { SETTINGS_OVERVIEW_VIEW } from '@/lib/settingsLayout';
import { GO_WINDOW_MS, isTyping, OPEN_COMMAND_BAR, OPEN_SHORTCUTS, pageKeys } from '@/lib/shortcuts';

/** The `g` destinations: a fixed page, a whole section, or one view wherever the schema puts it. */
const GO: Record<string, { path?: string; section?: string; view?: string }> = {
  h: { path: '/Management/CustomComponent/Dashboard' },
  p: { view: 'x:Account/User' },
  d: { view: 'x:Domain' },
  s: { path: `/Settings/${SETTINGS_OVERVIEW_VIEW}` },
  a: { section: 'Account' },
};

function Keys({ keys }: { keys: string[] }) {
  return (
    <span className="flex shrink-0 gap-1">
      {keys.map((k) => (
        <kbd
          key={k}
          className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border bg-muted px-1.5 font-mono text-xs font-medium"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

export function KeyboardShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const [sheetOpen, setSheetOpen] = useState(false);
  const goUntil = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]')) return;

      if (goUntil.current > Date.now()) {
        goUntil.current = 0;
        const dest = GO[e.key.toLowerCase()];
        if (!dest) return;
        e.preventDefault();
        if (dest.path) navigate(dest.path);
        else if (dest.section) navigate(`/${dest.section}`);
        else if (dest.view && viewToSection[dest.view]) navigate(`/${viewToSection[dest.view]}/${dest.view}`);
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        setSheetOpen(true);
      } else if (e.key === '/') {
        e.preventDefault();
        window.dispatchEvent(new Event(OPEN_COMMAND_BAR));
      } else if (e.key === 'g') {
        goUntil.current = Date.now() + GO_WINDOW_MS;
      } else {
        const handler = pageKeys.get(e.key);
        if (handler) {
          e.preventDefault();
          handler();
        }
      }
    }
    const openSheet = () => setSheetOpen(true);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener(OPEN_SHORTCUTS, openSheet);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener(OPEN_SHORTCUTS, openSheet);
    };
  }, [navigate, viewToSection]);

  const rows: { keys: string[]; label: string }[] = [
    { keys: ['?'], label: t('shortcuts.sheet', 'Show these shortcuts') },
    { keys: ['/'], label: t('shortcuts.commandBar', 'Search pages and run actions') },
    { keys: ['Ctrl', 'K'], label: t('shortcuts.commandBarToo', 'The same, from anywhere, even in a field') },
    { keys: ['g', 'h'], label: t('shortcuts.goHome', 'Go to the dashboard') },
    { keys: ['g', 'p'], label: t('shortcuts.goPeople', 'Go to people') },
    { keys: ['g', 'd'], label: t('shortcuts.goDomains', 'Go to domains') },
    { keys: ['g', 's'], label: t('shortcuts.goSettings', 'Go to settings') },
    { keys: ['g', 'a'], label: t('shortcuts.goAccount', 'Go to your account') },
    { keys: ['n'], label: t('shortcuts.new', 'Create a new one, on a list') },
    { keys: ['Esc'], label: t('shortcuts.escape', 'Close a dialog or menu') },
  ];

  return (
    <Dialog open={sheetOpen} onOpenChange={setSheetOpen}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('shortcuts.title', 'Keyboard shortcuts')}</DialogTitle>
          <DialogDescription>
            {t('shortcuts.hint', 'Single keys work anywhere except while you type in a field.')}
          </DialogDescription>
        </DialogHeader>
        <ul className="divide-y text-sm">
          {rows.map((r) => (
            <li key={r.keys.join('+')} className="flex items-center justify-between gap-4 py-2">
              <span>{r.label}</span>
              <Keys keys={r.keys} />
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
