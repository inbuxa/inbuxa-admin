/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: choosing a journal, for a rule's Journal it action (journaling
 * spec, JR-10).
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchJournals } from './api';
import type { Journal } from './model';

const NONE = '__none__';

export function JournalSelect({
  value,
  onChange,
  allowNone = false,
}: {
  value: string;
  onChange: (id: string) => void;
  allowNone?: boolean;
}) {
  const { t } = useTranslation();
  const [journals, setJournals] = useState<Journal[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchJournals(controller.signal)
      .then((list) => !controller.signal.aborted && setJournals(list))
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);

  if (failed) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('journal.selectUnavailable', 'Journals can’t be listed: seeing them needs the permission to see journals.')}
      </p>
    );
  }
  return (
    <Select value={value || (allowNone ? NONE : '')} onValueChange={(id) => onChange(id === NONE ? '' : id)}>
      <SelectTrigger className="w-72">
        <SelectValue placeholder={t('journal.choose', 'Choose a journal…')} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{t('journal.noJournal', 'Don’t journal it')}</SelectItem>}
        {(journals ?? []).map((journal) => (
          <SelectItem key={journal.id} value={journal.id ?? ''}>
            {journal.name}
            {!journal.enabled && ` ${t('journal.offSuffix', '(off)')}`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
