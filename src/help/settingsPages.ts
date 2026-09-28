/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: one sentence at the top of every Settings page, in our own words
 * (settings-reorg): what the page is for, for someone who hasn't run a mail
 * server for decades. It replaces the schema's subtitle in the page heading
 * and opens the page's "?" panel. Keys are view names.
 */

import type { PageHelp } from './texts';

export const SETTINGS_PAGE_HELP: Record<string, PageHelp> = {
  // ── Mail flow ──
  'x:MtaInboundSession': {
    about: 'How long other servers may stay connected and how much they may send in one conversation.',
  },
  'x:SenderAuth': {
    about:
      'The checks that tell real mail from forged mail (SPF, DKIM, DMARC), and how strict to be with mail that fails them.',
  },
  'x:MtaSts': {
    about: 'Tells other servers to always use encryption when they deliver to you, and to refuse if they can’t.',
  },
  'x:MtaOutboundStrategy': {
    about: 'The rules that pick, for each outgoing message, which route, schedule, connection and encryption it uses.',
  },
  'x:MtaRoute': {
    about: 'The ways outgoing mail can leave: straight to each recipient’s server, through a relay, or delivered here.',
  },
  'x:MtaDeliverySchedule': {
    about: 'How often delivery is retried when the other side isn’t answering, and when the sender is told it failed.',
  },
  'x:MtaVirtualQueue': {
    about: 'Separate lanes in the outgoing queue, so one busy destination or kind of mail doesn’t hold up the rest.',
  },
  'x:MtaInboundThrottle': {
    about:
      'How fast other servers and your own users may connect and send, so a flood or a stolen password can’t run away.',
  },
  'x:MtaOutboundThrottle': {
    about: 'How fast this server delivers to other servers, so big providers don’t see a burst and slow you down.',
  },
  'x:MtaQueueQuota': {
    about: 'How much mail one sender or destination may have waiting in the queue at once.',
  },
  'x:ReportSettings': {
    about: 'Which incoming reports the server reads, and the name and domain it signs its own reports with.',
  },
  'x:DmarcReportSettings': {
    about: 'The reports this server sends to other domains about mail claiming to be from them.',
  },
  'x:TlsReportSettings': {
    about: 'The reports this server sends to other domains about whether their mail reached you encrypted.',
  },
  'x:DkimReportSettings': {
    about: 'The report sent back to a domain when a message signed by it fails its DKIM check here.',
  },
  'x:SpfReportSettings': {
    about: 'The report sent back to a domain when mail claiming to come from it fails its SPF check here.',
  },
  'x:DsnReportSettings': {
    about: 'Who bounce messages come from when mail can’t be delivered or is delayed.',
  },
  'x:MtaMilter': {
    about: 'Outside mail filters (milters) that get a look at each incoming message, such as a virus scanner.',
  },
  'x:MtaHook': {
    about: 'Outside programs this server asks, over HTTP, whether to accept or change each incoming message.',
  },
  'x:SieveSystemScript': {
    about: 'Sieve scripts the server itself runs on mail, set up by an administrator.',
  },
  'x:SieveSystemInterpreter': {
    about: 'Limits and defaults for the server’s own Sieve scripts. For specialists.',
  },
  'x:MtaStageConnect': {
    about: 'What happens when another server first connects: the greeting and name this server gives. For specialists.',
  },
  'x:MtaStageEhlo': {
    about: 'What’s required of the name a connecting server introduces itself with. For specialists.',
  },
  'x:MtaStageAuth': {
    about: 'When mail apps must sign in to send, and which sign-in methods are offered. For specialists.',
  },
  'x:MtaStageMail': {
    about: 'Rules for the sender address given at the start of each delivery. For specialists.',
  },
  'x:MtaStageRcpt': {
    about:
      'Rules for recipients: who may relay, how many per message, and how unknown addresses are handled. For specialists.',
  },
  'x:MtaStageData': {
    about: 'Rules for the message itself as it arrives: size, headers, spam filtering and scripts. For specialists.',
  },
  'x:MtaExtensions': {
    about: 'Which optional SMTP features this server offers to other servers. For specialists.',
  },
  'x:MtaConnectionStrategy': {
    about: 'How outgoing connections are made: which local address and name to use, and timeouts. For specialists.',
  },
  'x:MtaTlsStrategy': {
    about: 'When outgoing delivery must be encrypted, and how strictly certificates are checked. For specialists.',
  },

  // ── Spam filter ──
  'x:SpamSettings': {
    about: 'How hard the spam filter is, and who is always trusted.',
  },
  'x:SpamTag': {
    about: 'How much each sign of spam adds to a message’s score. Higher totals mean more likely spam.',
  },
  'x:SpamRule': {
    about: 'The rules that look for signs of spam. Updates keep any rule you’ve edited.',
  },
  'x:SpamClassifier': {
    about: 'The filter that learns from the mail people mark as spam and not spam.',
  },
  'x:SpamLlm': {
    about: 'An AI model that reads doubtful messages and gives its verdict. Off unless a model is set up.',
  },
  'x:SpamPyzor': {
    about: 'Checks messages against Pyzor’s shared list of known spam, using a fingerprint rather than the message.',
  },
  'x:SpamDnsblSettings': {
    about: 'How many blocklist lookups the filter may make per message.',
  },
  'x:SpamDnsblServer': {
    about: 'The public blocklists the filter asks about senders, links and domains.',
  },
  'x:MemoryLookupKey/SpamTrustedDomain': {
    about: 'Domains whose mail is never treated as spam.',
  },
  'x:MemoryLookupKey/SpamBlockedDomain': {
    about: 'Domains whose mail is always treated as spam.',
  },
  'x:MemoryLookupKey/SpamTrap': {
    about: 'Addresses nobody uses, so anything sent to them is spam and teaches the filter.',
  },
  'x:MemoryLookupKey/SpamUrlRedirector': {
    about: 'Link shorteners and redirect services, which the filter follows to see where a link really goes.',
  },
  'x:SpamFileExtension': {
    about: 'Attachment types that count as risky, like programs disguised as documents.',
  },

  // ── Security ──
  'x:Authentication': {
    about: 'Where accounts and passwords come from, the rules for passwords, and what new accounts may do.',
  },
  'x:Directory': {
    about: 'Outside places accounts can come from: Active Directory, LDAP, SQL or an OpenID Connect provider.',
  },
  'x:OidcProvider': {
    about: 'This server as a sign-in provider for apps: how long sign-ins last and which apps may register.',
  },
  'x:Certificate': {
    about: 'The TLS certificates that encrypt connections to this server.',
  },
  'x:AcmeProvider': {
    about: 'Services like Let’s Encrypt that issue and renew certificates automatically.',
  },
  'x:Security': {
    about: 'When the server blocks an address by itself: after repeated wrong passwords, abuse or scanning.',
  },
  'x:Asn': {
    about: 'Where the server looks up which network and country an address belongs to, for filtering and reports.',
  },

  // ── Network ──
  'x:SystemSettings/NetworkSettings': {
    about: 'This server’s name on the internet, its main domain and certificate, and which proxies it trusts.',
  },
  'x:NetworkListener': {
    about: 'The ports the server listens on for mail, mail apps and the web.',
  },
  'x:SystemSettings/NetworkServices': {
    about: 'The host names mail apps and other servers are told to use, in automatic setup and DNS.',
  },
  'x:Http': {
    about: 'How the web server answers: extra headers, and trusting addresses passed on by a proxy.',
  },
  'x:Http/HttpSecurity': {
    about: 'Web security: which pages are open, which sites may call the API, and forcing HTTPS.',
  },
  'x:HttpForm': {
    about: 'A contact form on your website that arrives here as email.',
  },
  'x:DnsResolver': {
    about: 'Which DNS servers this server asks when it looks things up, including for secure (DNSSEC) answers.',
  },

  // ── Mail & apps ──
  'x:Email/EmailStorage': {
    about: 'How messages are stored, such as compressing them to save space.',
  },
  'x:Email/EmailDefaults': {
    about: 'The folders every new mailbox starts with, and default limits for each person.',
  },
  'x:Email/EmailLimits': {
    about: 'The largest message, folder depth and name length the server accepts.',
  },
  'x:Email/EmailEncryption': {
    about: 'Encrypting stored mail with each person’s own key. Hard to undo; read the help before turning on.',
  },
  'x:Imap': {
    about: 'Settings for IMAP mail apps: time limits, request sizes and sign-in rules.',
  },
  'x:Jmap/JmapLimits': {
    about: 'Limits for JMAP apps, like the webmail: how much one request may ask for or upload.',
  },
  'x:Jmap/JmapPush': {
    about: 'How apps are told about new mail straight away, without asking again and again.',
  },
  'x:Jmap/JmapWebsocket': {
    about: 'The live connection apps like the webmail keep open for instant updates.',
  },
  'x:WebDav': {
    about: 'Settings for calendar, contacts and file apps that use WebDAV, CalDAV or CardDAV.',
  },
  'x:Calendar': {
    about: 'Limits for calendars and events, and how many each person may have.',
  },
  'x:CalendarScheduling': {
    about: 'Meeting invitations: how they’re sent, received and answered.',
  },
  'x:CalendarAlarm': {
    about: 'Email reminders for calendar events: who they come from and what they look like.',
  },
  'x:AddressBook': {
    about: 'Limits for address books and contacts, and how many each person may have.',
  },
  'x:FileStorage': {
    about: 'Limits for files people store on the server: file size and how many.',
  },
  'x:Sharing': {
    about: 'Whether people can share calendars, contacts and files with each other, and with how many.',
  },
  'x:SieveUserInterpreter': {
    about: 'What people’s own mail filters (Sieve) may do, and their vacation reply defaults.',
  },
  'x:SieveUserScript': {
    about: 'Filter scripts you provide that people can include in their own filters.',
  },
  'x:Application': {
    about: 'Web apps this server hosts, like inbuxa webmail, and where they’re downloaded from.',
  },

  // ── Storage ──
  'x:DataStore': {
    about: 'Where mailbox structure, calendars, contacts and settings are kept. Changing it moves your data.',
  },
  'x:BlobStore': {
    about: 'Where message bodies, attachments and files are kept.',
  },
  'x:SearchStore': {
    about: 'Where the search index for mail, calendars and contacts is kept.',
  },
  'x:InMemoryStore': {
    about: 'Fast short-lived storage for rate limits and state shared between servers.',
  },
  'x:TracingStore': {
    about: 'Where delivery history is kept, or whether it’s kept at all.',
  },
  'x:MetricsStore': {
    about: 'Where the history behind the dashboard’s charts is kept, or whether it’s kept at all.',
  },
  'x:DataRetention/DataExpunge': {
    about: 'How long things are kept before they’re cleared out automatically.',
  },
  'x:DataRetention/DataCleanup': {
    about: 'How long things are kept, and when the storage cleanup jobs run.',
  },
  'x:DataRetention/ArchivingRetention': {
    about: 'How long deleted mail and accounts can still be brought back.',
  },
  'x:DataRetention/TelemetryRetention': {
    about: 'How long delivery history and chart history are kept, and how often charts are updated.',
  },
  'x:Cache': {
    about: 'How much memory is used to speed things up. Larger is faster, up to what the machine has.',
  },
  'x:Search': {
    about: 'What gets indexed for search, and in which languages.',
  },

  // ── Monitoring ──
  'x:Tracer': {
    about: 'Where the server writes its logs: files, the console, or a logging service.',
  },
  'x:EventTracingLevel': {
    about: 'Make particular events louder or quieter in the logs than their usual level.',
  },
  'x:Metrics': {
    about: 'Where the server’s numbers go, and which are collected.',
  },
  'x:Metrics/CollectorOtel': {
    about: 'Where the server’s numbers go, and which are collected.',
  },
  'x:Metrics/CollectorPrometheus': {
    about: 'Where the server’s numbers go, and which are collected.',
  },
  'x:Alert': {
    about: 'Messages that tell you when something needs attention, like a backed-up queue.',
  },
  'x:WebHook': {
    about: 'Events the server posts to your own systems as they happen.',
  },

  // ── System ──
  'x:Coordinator': {
    about: 'How the servers in a cluster talk to each other. Only needed with more than one server.',
  },
  'x:ClusterRole': {
    about: 'Which jobs each server in a cluster takes on. Only needed with more than one server.',
  },
  'x:TaskManager': {
    about: 'How background jobs are retried when they fail, and when the server gives up on them.',
  },
  'x:AiModel': {
    about: 'The AI models the server can use, such as for spam filtering and “Explain this”.',
  },
  'x:Enterprise': {
    about: 'The logo shown on sign-in pages and in apps when a domain has none of its own.',
  },
  'x:HttpLookup': {
    about: 'Lists fetched from the web, like public lists of spam domains, kept up to date for filters and rules.',
  },
  'x:StoreLookup': {
    about: 'Lists kept in a database for filters and rules to check against. For specialists.',
  },
  'x:MemoryLookupKey': {
    about: 'Named lists of values, like domains or addresses, that filters and rules check against.',
  },
  'x:MemoryLookupKeyValue': {
    about: 'Named lists of values paired with settings, for filters and rules. For specialists.',
  },
};
