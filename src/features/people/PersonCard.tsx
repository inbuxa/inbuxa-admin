/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: one person on the People list, as a card (admin UX roadmap, item
 * 10): initials, name and address, a storage ring, role, groups and since
 * when, and the row's own quick actions. Groups use it too.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { CardShell, InitialsMark, Pill, StorageSummary } from '@/features/cards/CardShell';
import type { Person } from './person';

export function PersonCard({
  person,
  selected,
  onToggleSelect,
  onOpen,
  actions,
  badge,
  hideEmptyStorage,
}: {
  person: Person;
  /** Shown only when the list allows mass actions. */
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  actions?: ReactNode;
  badge?: ReactNode;
  hideEmptyStorage?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <CardShell
      mark={<InitialsMark initials={person.initials} hue={person.hue} />}
      title={person.name ?? person.address}
      subtitle={person.name ? person.address : undefined}
      badge={badge}
      selected={selected}
      onToggleSelect={onToggleSelect}
      onOpen={onOpen}
      actions={actions}
    >
      {/* A group that holds no mail and has no limit has nothing to show here */}
      {(!hideEmptyStorage || person.used > 0 || person.quota !== null) && (
        <StorageSummary used={person.used} quota={person.quota} fill={person.fill} />
      )}

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {person.role !== 'user' && (
          <Pill>
            {person.role === 'admin' ? t('hover.roleAdmin', 'Administrator') : t('hover.roleCustom', 'Custom role')}
          </Pill>
        )}
        {person.groups > 0 && (
          <span>
            {t('people.groups', {
              count: person.groups,
              defaultValue_one: 'In {{count}} group',
              defaultValue_other: 'In {{count}} groups',
            })}
          </span>
        )}
        {person.createdAt && (
          <span>
            {t('people.since', 'Since {{date}}', {
              date: new Date(person.createdAt).toLocaleDateString(i18n.language, { dateStyle: 'medium' }),
            })}
          </span>
        )}
      </div>
    </CardShell>
  );
}
