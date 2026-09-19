/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA's own help, in plain words, keyed by help id. Options without an
 * entry here fall back to the description the server's schema gives. Write
 * new entries in our own words: say what the option does for the person
 * using it, and what goes wrong if it's set badly. Keep a tooltip to one
 * or two sentences; the manual is where the detail goes.
 *
 * Keys: `object` for a page, `object.field` for an option on it.
 */

export const FIELD_HELP: Record<string, string> = {
  // Domains
  'x:Domain.name': 'The domain people’s addresses end in, like example.com.',
  'x:Domain.aliases':
    'Other domains that deliver to the same people. Mail to someone@alias.com lands in someone@example.com.',
  'x:Domain.isEnabled': 'Turn off to stop accepting mail for this domain without deleting anything.',
  'x:Domain.catchAllAddress':
    'Where mail to addresses that don’t exist goes. Handy for small teams; on a busy domain it collects spam.',
  'x:Domain.subAddressing':
    'Lets people use address+anything@example.com to sort or trace their mail. On for most domains.',
  'x:Domain.allowRelaying':
    'Forward mail for unknown people to another server, for domains split between two systems. Leave off otherwise.',
  'x:Domain.dkimManagement':
    'Signing keys that prove mail from this domain is really yours. Automatic creates and rotates them for you.',
  'x:Domain.certificateManagement':
    'The TLS certificate for this domain’s mail and web addresses. Automatic gets and renews one for you.',
  'x:Domain.dnsManagement':
    'Whether the server writes this domain’s DNS records itself through your DNS host, or you add them by hand.',
  'x:Domain.reportAddressUri':
    'Where other mail servers send reports about mail claiming to be from you (DMARC, TLS). Postmaster is a good choice.',
  'x:Domain.memberTenantId': 'The customer or organization this domain belongs to, if you host more than one.',
  'x:Domain.directoryId': 'Where this domain’s accounts and passwords are kept: here, or an outside directory.',
  'x:Domain.logo': 'A logo for this domain’s sign-in page and mail apps. A link or an uploaded image.',

  // People
  'x:UserAccount.name': 'The part before the @. Together with the domain it makes the person’s address.',
  'x:UserAccount.description': 'The person’s full name, as others see it.',
  'x:UserAccount.aliases': 'More addresses that deliver to this person.',
  'x:UserAccount.quotas':
    'Limits for this person, like how much storage they may use. Empty means the server’s defaults.',
  'x:UserAccount.roles': 'What this person may do. Most people are plain users; admins manage the server.',
  'x:UserAccount.memberGroupIds': 'Groups this person belongs to. They share the group’s mail and can send as it.',
  'x:UserAccount.credentials': 'How this person signs in: a password, app passwords for mail apps, and more.',
  'x:UserAccount.locale': 'The language for messages the server sends this person.',
  'x:UserAccount.timeZone': 'Used for calendar invitations and scheduled messages.',
  'x:GroupAccount.name': 'The group’s address, before the @. Mail to it reaches every member.',

  // DNS providers
  'x:DnsServerCloudflare.secret':
    'A Cloudflare API token that can edit DNS for your zone. Make it with the “Edit zone DNS” template.',
  'x:DnsServerCloudflare.email': 'Only for the old Global API Key. Leave empty when you use an API token.',
  'x:DnsServerCloud.secret': 'The API token or key from your DNS host. Give it DNS access for this domain only.',
  'x:DnsServerCloudflare.ttl': 'How long other servers may cache the records written. Five minutes is a good default.',
  'x:DnsServerCloud.ttl': 'How long other servers may cache the records written. Five minutes is a good default.',

  // Security
  'x:BlockedIp.address': 'An address or network, like 203.0.113.7 or 203.0.113.0/24, refused before it can talk.',
  'x:BlockedIp.reason': 'A note for yourself on why it was blocked.',
  'x:BlockedIp.expiresAt': 'When the block lifts by itself. Empty means it stays until you remove it.',
  'x:AllowedIp.address': 'An address or network that is never blocked automatically, like your office or monitoring.',
};

export interface PageHelp {
  /** What the page is for, in a sentence or two. */
  about: string;
  /** The things people come here to do. */
  tasks?: string[];
}

export const PAGE_HELP: Record<string, PageHelp> = {
  'x:Domain': {
    about: 'The domains this server receives and sends mail for. Each person’s address belongs to one of them.',
    tasks: [
      'Add a domain, then publish its DNS records so mail can find you.',
      'Let the server publish DNS for you: open a domain and use “Set it up” in its DNS section.',
      'Turn on automatic DKIM and certificates so keys and certificates renew themselves.',
    ],
  },
  'x:Account/User': {
    about: 'Everyone with a mailbox here. Each person has an address, a password and, optionally, limits.',
    tasks: [
      'Add a person and give them a password.',
      'Give someone more addresses with aliases.',
      'Set a storage limit under quotas.',
    ],
  },
  'x:Account/Group': {
    about: 'Shared mailboxes, like sales@ or support@, that several people read and send from.',
    tasks: ['Create a group, then add people to it from their own page under Groups.'],
  },
  'x:MailingList': {
    about: 'Addresses that pass each message on to a list of recipients, inside or outside this server.',
  },
  'x:Tenant': {
    about: 'Separate customers or organizations on one server, each with their own domains, people and limits.',
  },
  'x:Role': {
    about: 'Named sets of permissions. Give a role to a person to let them do more, or less.',
  },
  'x:OAuthClient': {
    about: 'Apps allowed to sign people in through this server, like INBUXA webmail and INBUXA Admin.',
  },
  'x:DkimSignature': {
    about: 'The keys that sign outgoing mail so receivers can check it really came from you.',
    tasks: ['Let domains manage their own keys: set DKIM to automatic on the domain.'],
  },
  'x:QueuedMessage': {
    about:
      'Mail waiting to go out. Most leaves within seconds; what stays here is waiting for a server that isn’t answering.',
    tasks: [
      'See why a message is stuck: open it and look at each recipient’s status.',
      'Retry now, or cancel mail that will never be delivered.',
    ],
  },
  'x:DnsServer': {
    about: 'Connections to your DNS hosts, so the server can publish and update its own DNS records.',
    tasks: ['Connect one the easy way: open a domain and use “Set it up” in its DNS section.'],
  },
  'x:BlockedIp': {
    about: 'Addresses refused before they can talk to the server. The server adds some itself when it spots attacks.',
    tasks: ['Unblock someone: find their address and delete the entry.'],
  },
  'x:AllowedIp': {
    about: 'Addresses the server never blocks by itself, like your office network or monitoring.',
  },
  'x:DmarcExternalReport': {
    about:
      'Reports from other mail providers on mail they received claiming to be from your domains, and whether it passed.',
  },
  'x:TlsExternalReport': {
    about: 'Reports from other mail providers on whether they could reach you over an encrypted connection.',
  },
  'x:Task': {
    about: 'Background work the server has scheduled: DNS updates, key rotation, certificate renewal and upkeep.',
  },
  'x:Task/TaskFailed': {
    about: 'Background work that failed. Each entry says why; most retry by themselves once the cause is fixed.',
  },
  'x:Log': {
    about: 'What the server has been doing, newest first. Useful for tracing a problem back to its cause.',
  },
};

/** The help text for an option: ours when written, else the schema's. */
export function fieldHelp(id: string | undefined, fallback?: string | null): string | null {
  return (id && FIELD_HELP[id]) || fallback || null;
}
