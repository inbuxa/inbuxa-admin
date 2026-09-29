/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: Settings, grouped by what someone comes to do rather than by the
 * configuration file (spec: settings-reorg). The server's schema ships
 * Settings as nineteen groups; this regroups the same pages into a handful of
 * categories, short enough for the section bar.
 *
 * Only the menu changes. Every page keeps its view name, so its URL
 * (/Settings/<viewName>), bookmarks, last-visited and help links all stay.
 * The server still decides which pages exist: a page listed here that the
 * schema doesn't carry is left out, and a page the schema carries that isn't
 * listed here lands in System › Other, so an upstream addition never vanishes.
 */

import type { Layout, LayoutItem, LayoutSubItem, Schema } from '@/types/schema';

export const SETTINGS_LAYOUT_NAME = 'Settings';
export const SETTINGS_OVERVIEW_VIEW = 'CustomComponent/SettingsOverview';

/** A page: its view, and a plainer label than the schema's where one helps. */
export interface SettingsPage {
  viewName: string;
  label?: string;
}

export interface SettingsGroup {
  name: string;
  /** Protocol-level detail most servers never touch: drawn last and dimmed. */
  advanced?: boolean;
  pages: SettingsPage[];
}

export interface SettingsCategory {
  name: string;
  icon: string;
  groups: SettingsGroup[];
}

const p = (viewName: string, label?: string): SettingsPage => (label ? { viewName, label } : { viewName });

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    name: 'Mail flow',
    icon: 'route',
    groups: [
      {
        name: 'Receiving',
        pages: [
          p('x:MtaInboundSession', 'Incoming connections'),
          p('x:SenderAuth', 'Sender checks (SPF, DKIM, DMARC)'),
          p('x:MtaSts', 'MTA-STS'),
        ],
      },
      {
        name: 'Sending',
        pages: [
          p('x:MtaOutboundStrategy', 'Delivery strategy'),
          p('x:MtaRoute', 'Routes and relays'),
          p('x:MtaDeliverySchedule', 'Retry schedules'),
          p('x:MtaVirtualQueue', 'Queues'),
        ],
      },
      {
        name: 'Limits',
        pages: [
          p('x:MtaInboundThrottle', 'Incoming rate limits'),
          p('x:MtaOutboundThrottle', 'Outgoing rate limits'),
          p('x:MtaQueueQuota', 'Queue quotas'),
        ],
      },
      {
        name: 'Reports',
        pages: [
          p('x:ReportSettings', 'General'),
          p('x:DmarcReportSettings', 'DMARC'),
          p('x:TlsReportSettings', 'TLS'),
          p('x:DkimReportSettings', 'DKIM'),
          p('x:SpfReportSettings', 'SPF'),
          p('x:DsnReportSettings', 'Bounce messages (DSN)'),
        ],
      },
      {
        name: 'Filters & scripts',
        pages: [
          p('x:MtaMilter', 'Milters'),
          p('x:MtaHook', 'Hooks'),
          p('x:SieveSystemScript', 'Server Sieve scripts'),
          p('x:SieveSystemInterpreter', 'Server Sieve interpreter'),
        ],
      },
      {
        name: 'Advanced',
        advanced: true,
        pages: [
          p('x:MtaStageConnect', 'Connection (Connect)'),
          p('x:MtaStageEhlo', 'Greeting (EHLO)'),
          p('x:MtaStageAuth', 'Sign-in (AUTH)'),
          p('x:MtaStageMail', 'Sender (MAIL FROM)'),
          p('x:MtaStageRcpt', 'Recipients (RCPT TO)'),
          p('x:MtaStageData', 'Message (DATA)'),
          p('x:MtaExtensions', 'SMTP extensions'),
          p('x:MtaConnectionStrategy', 'Connection strategies'),
          p('x:MtaTlsStrategy', 'TLS strategies'),
        ],
      },
    ],
  },
  {
    name: 'Spam filter',
    icon: 'shield-alert',
    groups: [
      {
        name: 'Protection',
        pages: [p('x:SpamSettings', 'Filter settings'), p('x:SpamTag', 'Scores'), p('x:SpamRule', 'Rules')],
      },
      {
        name: 'Classifiers',
        pages: [
          p('x:SpamClassifier', 'Statistical classifier'),
          p('CustomComponent/LocalAi', 'Local AI'),
          p('x:SpamLlm', 'LLM classifier'),
          p('x:SpamPyzor', 'Pyzor'),
        ],
      },
      {
        name: 'Blocklists (DNSBL)',
        pages: [p('x:SpamDnsblSettings', 'Settings'), p('x:SpamDnsblServer', 'Servers')],
      },
      {
        name: 'Lists',
        pages: [
          p('x:MemoryLookupKey/SpamTrustedDomain', 'Trusted domains'),
          p('x:MemoryLookupKey/SpamBlockedDomain', 'Blocked domains'),
          p('x:MemoryLookupKey/SpamTrap', 'Spam traps'),
          p('x:MemoryLookupKey/SpamUrlRedirector', 'URL redirectors'),
          p('x:SpamFileExtension', 'File extensions'),
        ],
      },
    ],
  },
  {
    name: 'Security',
    icon: 'lock',
    groups: [
      {
        name: 'Sign-in',
        pages: [
          p('x:Authentication', 'General'),
          p('x:Directory', 'Directories'),
          p('x:OidcProvider', 'OIDC provider'),
        ],
      },
      {
        name: 'Certificates',
        pages: [p('x:Certificate', 'Certificates'), p('x:AcmeProvider', 'Automatic certificates (ACME)')],
      },
      {
        name: 'Protection',
        pages: [
          p('x:Security', 'Settings'),
          p('CustomComponent/LegacyProtocols', 'Hardening'),
          p('x:BlockedIp', 'Blocked IPs'),
          p('x:AllowedIp', 'Allowed IPs'),
          p('x:Asn', 'ASN & GeoIP'),
        ],
      },
    ],
  },
  {
    name: 'Network',
    icon: 'cable',
    groups: [
      {
        name: 'Connections',
        pages: [
          p('x:SystemSettings/NetworkSettings', 'General'),
          p('x:NetworkListener', 'Listeners (ports)'),
          p('x:SystemSettings/NetworkServices', 'Services'),
        ],
      },
      {
        name: 'Web',
        pages: [p('x:Http', 'HTTP'), p('x:Http/HttpSecurity', 'HTTP security'), p('x:HttpForm', 'Contact form')],
      },
      {
        name: 'DNS',
        pages: [p('x:DnsServer', 'DNS providers'), p('x:DnsResolver', 'DNS resolver')],
      },
    ],
  },
  {
    name: 'Mail & apps',
    icon: 'mail',
    groups: [
      {
        name: 'Email',
        pages: [
          p('x:Email/EmailStorage', 'Storage'),
          p('x:Email/EmailDefaults', 'Defaults'),
          p('x:Email/EmailLimits', 'Email limits'),
          p('x:Email/EmailEncryption', 'Encryption'),
        ],
      },
      {
        name: 'Protocols',
        pages: [
          p('x:Imap', 'IMAP'),
          p('x:Jmap/JmapLimits', 'JMAP limits'),
          p('x:Jmap/JmapPush', 'JMAP push'),
          p('x:Jmap/JmapWebsocket', 'JMAP WebSocket'),
          p('x:WebDav', 'WebDAV'),
        ],
      },
      {
        name: 'Calendar & contacts',
        pages: [
          p('x:Calendar', 'Calendar'),
          p('x:CalendarScheduling', 'Scheduling'),
          p('x:CalendarAlarm', 'Alarms'),
          p('x:AddressBook', 'Address book'),
        ],
      },
      {
        name: 'Files & sharing',
        pages: [p('x:FileStorage', 'File storage'), p('x:Sharing', 'Sharing')],
      },
      {
        name: "People's filters",
        pages: [p('x:SieveUserInterpreter', 'Sieve interpreter'), p('x:SieveUserScript', 'Sieve scripts')],
      },
      {
        name: 'Apps',
        pages: [p('x:Application', 'Web applications')],
      },
    ],
  },
  {
    name: 'Storage',
    icon: 'database',
    groups: [
      {
        name: 'Stores',
        pages: [
          p('x:DataStore', 'Data store'),
          p('x:BlobStore', 'Blobs (messages & files)'),
          p('x:SearchStore', 'Search'),
          p('x:InMemoryStore', 'In-memory'),
          p('x:TracingStore', 'Tracing'),
          p('x:MetricsStore', 'Metrics'),
        ],
      },
      {
        name: 'Retention',
        pages: [
          p('x:DataRetention/DataExpunge', 'Auto-expunge'),
          p('x:DataRetention/DataCleanup', 'Data cleanup'),
          p('x:DataRetention/ArchivingRetention', 'Archiving'),
          p('x:DataRetention/TelemetryRetention', 'Telemetry'),
        ],
      },
      {
        name: 'Performance',
        pages: [p('x:Cache', 'Cache'), p('x:Search', 'Search indexing')],
      },
    ],
  },
  {
    name: 'Monitoring',
    icon: 'chart-line',
    groups: [
      {
        name: 'Logs & traces',
        pages: [p('x:Tracer', 'Tracers'), p('x:EventTracingLevel', 'Event levels')],
      },
      {
        name: 'Metrics',
        pages: [
          p('x:Metrics', 'General'),
          p('x:Metrics/CollectorOtel', 'OpenTelemetry'),
          p('x:Metrics/CollectorPrometheus', 'Prometheus'),
        ],
      },
      {
        name: 'Notifications',
        pages: [p('x:Alert', 'Alerts'), p('x:WebHook', 'Webhooks')],
      },
    ],
  },
  {
    name: 'System',
    icon: 'boxes',
    groups: [
      {
        name: 'Cluster',
        pages: [p('x:Coordinator', 'Coordinator'), p('x:ClusterRole', 'Roles')],
      },
      {
        name: 'Server',
        pages: [p('x:TaskManager', 'Task manager'), p('x:AiModel', 'AI models'), p('x:Enterprise', 'Branding')],
      },
      {
        name: 'Lookups',
        pages: [
          p('x:HttpLookup', 'HTTP lists'),
          p('x:StoreLookup', 'Store lookups'),
          p('x:MemoryLookupKey', 'In-memory keys'),
          p('x:MemoryLookupKeyValue', 'In-memory key-values'),
        ],
      },
    ],
  },
];

/** Where pages the table doesn't know about go. */
const OTHER_CATEGORY = 'System';
const OTHER_GROUP = 'Other';

/** Every link in a layout, view name → the schema's label, in schema order. */
function collectLinks(items: (LayoutItem | LayoutSubItem)[], out: Map<string, string>): Map<string, string> {
  for (const item of items) {
    if ('link' in item) out.set(item.link.viewName, item.link.name);
    else if ('container' in item) collectLinks(item.container.items, out);
    else if (item.type === 'link') out.set(item.viewName, item.name);
    else collectLinks(item.items, out);
  }
  return out;
}

/** The Settings layout, regrouped. Other layouts pass through untouched. */
export function regroupSettings(layout: Layout): Layout {
  if (layout.name !== SETTINGS_LAYOUT_NAME) return layout;
  const serverLinks = collectLinks(layout.items, new Map());
  const placed = new Set<string>();

  const categories = SETTINGS_CATEGORIES.map((cat) => {
    const groups: LayoutSubItem[] = [];
    for (const group of cat.groups) {
      const links: LayoutSubItem[] = [];
      for (const page of group.pages) {
        const serverName = serverLinks.get(page.viewName);
        if (serverName === undefined || placed.has(page.viewName)) continue;
        placed.add(page.viewName);
        links.push({ type: 'link', name: page.label ?? serverName, viewName: page.viewName });
      }
      if (links.length > 0) {
        groups.push({ type: 'container', name: group.name, items: links, ...(group.advanced && { advanced: true }) });
      }
    }
    return { name: cat.name, icon: cat.icon, groups };
  });

  const leftovers: LayoutSubItem[] = [];
  for (const [viewName, name] of serverLinks) {
    if (!placed.has(viewName)) leftovers.push({ type: 'link', name, viewName });
  }
  if (leftovers.length > 0) {
    const home = categories.find((c) => c.name === OTHER_CATEGORY) ?? categories[categories.length - 1];
    home.groups.push({ type: 'container', name: OTHER_GROUP, items: leftovers });
  }

  const items: LayoutItem[] = [{ link: { name: 'Overview', icon: 'layout-grid', viewName: SETTINGS_OVERVIEW_VIEW } }];
  for (const cat of categories) {
    if (cat.groups.length > 0) items.push({ container: { name: cat.name, icon: cat.icon, items: cat.groups } });
  }
  return { ...layout, items };
}

/** The schema with its Settings layout regrouped; applied once, when the schema loads. */
export function withRegroupedSettings(schema: Schema): Schema {
  if (!schema.layouts.some((l) => l.name === SETTINGS_LAYOUT_NAME)) return schema;
  return { ...schema, layouts: schema.layouts.map(regroupSettings) };
}
