/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The console's strings. It ships in English only (en.json); a browser asking
 * for another language gets English. The admin's own locale still sets the
 * reading direction.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

import en from './en.json';

const RIGHT_TO_LEFT = new Set(['ar', 'fa', 'he', 'ur']);

/** "pt_BR" or "pt-BR" → "pt". */
const languageOf = (locale: string) => locale.split(/[-_]/)[0];

void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: languageOf(navigator.language ?? '') || 'en',
  fallbackLng: 'en',
  // React escapes what it renders.
  interpolation: { escapeValue: false },
});

/** Switches to the signed-in account's locale. */
export function setLocale(locale: string): void {
  const language = languageOf(locale);
  void i18n.changeLanguage(language);
  document.documentElement.dir = RIGHT_TO_LEFT.has(language) ? 'rtl' : 'ltr';
}

export default i18n;
