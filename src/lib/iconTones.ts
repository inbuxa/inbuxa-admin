/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type Tone = 'teal' | 'orange' | 'sky' | 'violet' | 'rose' | 'amber' | 'emerald' | 'indigo' | 'slate';

/**
 * Colors by meaning, for the icons the server's layout names:
 * - teal: mail itself;
 * - rose: security;
 * - amber: storage and data;
 * - sky: network and connectivity;
 * - violet: people and identity;
 * - indigo: monitoring and reports;
 * - emerald: automation and tasks;
 * - orange: look and feel;
 * - slate: the rest.
 */
const TONES: Record<string, Tone> = {
  'layout-dashboard': 'teal',
  mail: 'teal',
  inbox: 'teal',
  send: 'teal',
  'mail-minus': 'teal',
  plane: 'teal',
  route: 'sky',
  globe: 'sky',
  cable: 'sky',
  zap: 'sky',
  monitor: 'sky',
  'shield-check': 'rose',
  'shield-alert': 'rose',
  lock: 'rose',
  fingerprint: 'rose',
  'key-round': 'rose',
  'key-square': 'rose',
  filter: 'rose',
  database: 'amber',
  archive: 'amber',
  boxes: 'amber',
  folder: 'amber',
  search: 'amber',
  'search-code': 'amber',
  users: 'violet',
  'circle-user': 'violet',
  contact: 'violet',
  calendar: 'violet',
  activity: 'indigo',
  'chart-line': 'indigo',
  'file-text': 'indigo',
  'list-checks': 'emerald',
  clock: 'emerald',
  brain: 'emerald',
  'file-code': 'emerald',
  palette: 'orange',
  'app-window': 'orange',
  settings: 'slate',
  'sliders-horizontal': 'slate',
};

const FALLBACK: Tone[] = ['teal', 'sky', 'violet', 'amber', 'emerald', 'indigo', 'orange', 'rose'];

/** The tone for an icon name: by meaning where known, otherwise a stable pick from its name. */
export function toneFor(name: string): Tone {
  const known = TONES[name];
  if (known) return known;
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FALLBACK[h % FALLBACK.length];
}
