/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: a card for a mailing list, tenant, role, OAuth client or domain,
 * on the same frame as a person's card, showing what the table hides in
 * columns or behind a click.
 */

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AppWindow, Globe, ShieldCheck } from 'lucide-react';
import { CardShell, IconMark, InitialsMark, Pill, StorageSummary } from './CardShell';
import type { ObjectCardModel } from './objectCard';

function Footer({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">{children}</div>;
}

export function ObjectCard({
  card,
  selected,
  onToggleSelect,
  onOpen,
  actions,
}: {
  card: ObjectCardModel;
  selected?: boolean;
  onToggleSelect?: () => void;
  onOpen: () => void;
  actions?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { dateStyle: 'medium' });
  const since = (iso?: string) => iso && <span>{t('people.since', 'Since {{date}}', { date: date(iso) })}</span>;
  const shell = { title: card.title, selected, onToggleSelect, onOpen, actions };

  switch (card.kind) {
    case 'mailingList':
      return (
        <CardShell {...shell} mark={<InitialsMark initials={card.initials} hue={card.hue} />} subtitle={card.address}>
          <Footer>
            <Pill tone={card.recipients > 0 ? 'plain' : 'muted'}>
              {t('cards.recipients', {
                count: card.recipients,
                defaultValue_one: '{{count}} recipient',
                defaultValue_other: '{{count}} recipients',
              })}
            </Pill>
            {card.aliases > 0 && (
              <span>
                {t('cards.aliases', {
                  count: card.aliases,
                  defaultValue_one: '{{count}} other address',
                  defaultValue_other: '{{count}} other addresses',
                })}
              </span>
            )}
          </Footer>
        </CardShell>
      );

    case 'tenant':
      return (
        <CardShell {...shell} mark={<InitialsMark initials={card.initials} hue={card.hue} />}>
          <StorageSummary used={card.used} quota={card.quota} fill={card.fill} />
          <Footer>{since(card.createdAt)}</Footer>
        </CardShell>
      );

    case 'role':
      return (
        <CardShell
          {...shell}
          mark={
            <IconMark className="bg-violet-500/15 text-violet-700 dark:text-violet-300">
              <ShieldCheck className="h-5 w-5" />
            </IconMark>
          }
          subtitle={t('cards.granted', {
            count: card.granted,
            defaultValue_one: '{{count}} permission granted',
            defaultValue_other: '{{count}} permissions granted',
          })}
        >
          {(card.removed > 0 || card.includes > 0) && (
            <Footer>
              {card.includes > 0 && (
                <Pill>
                  {t('cards.includes', {
                    count: card.includes,
                    defaultValue_one: 'Includes {{count}} role',
                    defaultValue_other: 'Includes {{count}} roles',
                  })}
                </Pill>
              )}
              {card.removed > 0 && (
                <Pill tone="bad">
                  {t('cards.removed', {
                    count: card.removed,
                    defaultValue_one: '{{count}} taken away',
                    defaultValue_other: '{{count}} taken away',
                  })}
                </Pill>
              )}
            </Footer>
          )}
        </CardShell>
      );

    case 'oauthClient':
      return (
        <CardShell
          {...shell}
          mark={
            <IconMark className="bg-amber-500/15 text-amber-700 dark:text-amber-300">
              <AppWindow className="h-5 w-5" />
            </IconMark>
          }
          subtitle={
            card.clientId !== card.title ? <span className="font-mono text-xs">{card.clientId}</span> : undefined
          }
        >
          <Footer>
            <Pill tone={card.redirects > 0 ? 'plain' : 'muted'}>
              {t('cards.redirects', {
                count: card.redirects,
                defaultValue_one: '{{count}} sign-in return address',
                defaultValue_other: '{{count}} sign-in return addresses',
              })}
            </Pill>
            {card.expiresAt && (
              <Pill tone={card.expired ? 'bad' : 'muted'}>
                {card.expired
                  ? t('cards.expired', 'Expired {{date}}', { date: date(card.expiresAt) })
                  : t('cards.expires', 'Expires {{date}}', { date: date(card.expiresAt) })}
              </Pill>
            )}
            {since(card.createdAt)}
          </Footer>
        </CardShell>
      );

    case 'domain': {
      const mode = (on: boolean) => (
        <Pill tone={on ? 'good' : 'muted'}>{on ? t('hover.automatic', 'Automatic') : t('hover.manual', 'Manual')}</Pill>
      );
      return (
        <CardShell
          {...shell}
          mark={
            <IconMark className="bg-sky-500/15 text-sky-700 dark:text-sky-300">
              <Globe className="h-5 w-5" />
            </IconMark>
          }
          subtitle={card.description}
          badge={
            // On is the usual state: only say so when a domain is turned off
            !card.enabled && <Pill tone="bad">{t('hover.disabled', 'Turned off')}</Pill>
          }
        >
          <div className="space-y-1.5 text-sm">
            {(
              [
                [t('hover.dns', 'DNS records'), card.dns],
                [t('hover.dkim', 'Signing keys'), card.dkim],
                [t('hover.certs', 'Certificates'), card.certs],
              ] as const
            ).map(([label, on]) => (
              <div key={label} className="flex items-center justify-between gap-3 text-xs">
                <span className="text-muted-foreground">{label}</span>
                {mode(on)}
              </div>
            ))}
          </div>
          {(card.aliases > 0 || card.createdAt) && (
            <Footer>
              {card.aliases > 0 && (
                <span>
                  {t('cards.domainAliases', {
                    count: card.aliases,
                    defaultValue_one: '{{count}} alias domain',
                    defaultValue_other: '{{count}} alias domains',
                  })}
                </span>
              )}
              {since(card.createdAt)}
            </Footer>
          )}
        </CardShell>
      );
    }
  }
}
