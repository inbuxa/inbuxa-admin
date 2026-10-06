/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: what an empty list says (admin UX roadmap, item 12). Empty because
 * of the filters: say so, and offer to clear them. Empty for real: say what
 * goes here, in plain words for the lists people meet first, and offer to
 * create the first one.
 */

import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/common/EmptyState';

export function ListEmptyState({
  viewName,
  plural,
  singular,
  filtered,
  onClearFilters,
  onCreate,
}: {
  viewName: string;
  /** "domains", "users"; the list's own words. */
  plural: string;
  singular: string;
  /** Filters are on, so the list may not be empty at all. */
  filtered: boolean;
  onClearFilters: () => void;
  /** Present when the reader may create one. */
  onCreate?: () => void;
}) {
  const { t } = useTranslation();

  if (filtered) {
    return (
      <EmptyState
        title={t('empty.filteredTitle', 'Nothing matches')}
        hint={t('empty.filteredHint', 'No {{plural}} match these filters.', { plural })}
        action={
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            <X className="mr-1.5 h-4 w-4" />
            {t('empty.clearFilters', 'Clear filters')}
          </Button>
        }
      />
    );
  }

  let title: string;
  let hint: string;
  switch (viewName) {
    case 'x:Domain':
      title = t('empty.domainsTitle', 'No domains yet');
      hint = t(
        'empty.domainsHint',
        'A domain is the part after the @. Add yours and you’ll get the DNS records to publish for it.',
      );
      break;
    case 'x:Account/User':
      title = t('empty.peopleTitle', 'No people yet');
      hint = t('empty.peopleHint', 'Each person gets a mailbox, a calendar and contacts. Add the first one.');
      break;
    case 'x:Account/Group':
      title = t('empty.groupsTitle', 'No groups yet');
      hint = t('empty.groupsHint', 'A group gives several people one address, and can share mailboxes with them.');
      break;
    case 'x:MailingList':
      title = t('empty.listsTitle', 'No mailing lists yet');
      hint = t('empty.listsHint', 'A mailing list sends one message on to everyone on it.');
      break;
    case 'x:QueuedMessage':
      title = t('empty.queueTitle', 'The queue is empty');
      hint = t('empty.queueHint', 'Mail waiting to be delivered shows up here until it goes out.');
      break;
    case 'x:DmarcExternalReport':
    case 'x:TlsExternalReport':
    case 'x:ArfExternalReport':
      title = t('empty.reportsTitle', 'No reports yet');
      hint = t('empty.reportsHint', 'Large providers send one the day after they get mail from your domains.');
      break;
    case 'x:ApiKey':
      title = t('empty.apiKeysTitle', 'No API keys yet');
      hint = t('empty.apiKeysHint', 'An API key lets a script or another app manage this server.');
      break;
    case 'x:WebHook':
      title = t('empty.webhooksTitle', 'No webhooks yet');
      hint = t('empty.webhooksHint', 'A webhook tells another app when something happens here.');
      break;
    default:
      title = t('empty.title', 'No {{plural}} yet', { plural });
      hint = t('empty.hint', 'When one is added, it shows up here.');
  }

  return (
    <EmptyState
      title={title}
      hint={hint}
      action={
        onCreate && (
          <Button type="button" size="sm" onClick={onCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('list.create', 'Create {{name}}', { name: singular })}
          </Button>
        )
      }
    />
  );
}
