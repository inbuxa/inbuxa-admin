/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs LLC
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: the Security page's help (security to-do list spec): what each
 * check looks at, when it counts as something to do, and what its action
 * does. Kept in the same order as the checks in features/security/checks.ts.
 */

import type { PageHelp } from './texts';

export const SECURITY_CHECK_HELP: { check: string; label: string; text: string }[] = [
  {
    check: 'SS-1',
    label: 'Plain-text passwords over unencrypted IMAP',
    text: 'Critical when IMAP accepts a password on a connection that isn’t encrypted. Fix turns that off; mail apps then sign in over TLS, as nearly all do already.',
  },
  {
    check: 'SS-2',
    label: 'The relaying rule',
    text: 'Critical when the rule for who may send mail on to other servers differs from the default (only people who signed in). An edit may be deliberate, so this is a Review: both rules are shown side by side, and nothing is reset for you.',
  },
  {
    check: 'SS-3',
    label: 'Domains that relay for anyone',
    text: 'Critical when a domain passes on mail without a sign-in. That’s for a domain split between two mail systems; anywhere else it lets strangers send through this server. Review lists the domains.',
  },
  {
    check: 'SS-4',
    label: 'Sign-in for sending',
    text: 'Critical when the rule for when sending needs a sign-in differs from the default (everywhere but port 25). Review shows both rules.',
  },
  {
    check: 'SS-5',
    label: 'Certificates expired or expiring within 7 days',
    text: 'Critical for each certificate that has expired or will within a week. Review opens the certificate; renewing isn’t a one-click fix, and a certificate the server gets itself renews on its own well before this.',
  },
  {
    check: 'SS-6',
    label: 'Automatic bans',
    text: 'Important when any of the three automatic IP bans (failed sign-ins, abuse, port scans) is switched off. Fix puts back the default rate for each one that’s off.',
  },
  {
    check: 'SS-7',
    label: 'Rate limits for people who aren’t signed in',
    text: 'Important when requests from people who aren’t signed in have no rate limit. Fix puts back the default.',
  },
  {
    check: 'SS-8',
    label: 'OAuth client registration',
    text: 'Important when apps may register themselves, or sign people in without being registered. Fix turns off anonymous registration and requires registration again; apps you registered keep working.',
  },
  {
    check: 'SS-9',
    label: 'Password rules',
    text: 'Important when the minimum password strength or length is below the default. Fix raises whichever is lower. Existing passwords aren’t touched; the rules apply the next time each one changes.',
  },
  {
    check: 'SS-10',
    label: 'Certificate checks on outgoing mail',
    text: 'Important for each TLS strategy that accepts invalid certificates when delivering. Review opens the strategy: a relay with a self-signed certificate may need it, nothing else does.',
  },
  {
    check: 'SS-11',
    label: 'DMARC checks on incoming mail',
    text: 'Important when the DMARC check no longer runs on port 25, where other servers deliver. A stricter rule than the default is fine and isn’t flagged. Review shows the rule and the default.',
  },
  {
    check: 'SS-12',
    label: 'Metrics access',
    text: 'Important when Prometheus metrics are on with no password. Review opens the page where Make a password sets one; the password is yours to keep, so it’s never set for you.',
  },
  {
    check: 'SS-13',
    label: 'Mail records in DNS',
    text: 'Important for each enabled domain missing its MX, SPF, DKIM or DMARC record in public DNS, as seen through Cloudflare’s resolver from your browser. Review opens the domain’s records. DNS is never written from this page.',
  },
  {
    check: 'SS-14',
    label: 'Certificates expiring within 30 days',
    text: 'Important for each certificate that expires within a month but not within a week (that’s SS-5).',
  },
  {
    check: 'SS-15',
    label: 'Legacy mail protocols',
    text: 'Good practice while any of IMAP, POP3 or ManageSieve is on. The switch further down this page shows who used each one lately; it’s never a one-click fix, since it closes ports.',
  },
  {
    check: 'SS-16',
    label: 'Password hashing',
    text: 'Good practice when new passwords are hashed with PBKDF2. Fix switches to Argon2id; existing hashes stay as they are until each password changes.',
  },
  {
    check: 'SS-17',
    label: 'MTA-STS',
    text: 'Good practice until MTA-STS is enforced. It starts in testing on purpose: move to enforce once the TLS reports other servers send you look clean. Review opens the setting.',
  },
  {
    check: 'SS-18',
    label: 'DMARC policies',
    text: 'Good practice for each domain whose DMARC record says p=none. Once DMARC reports show your own mail passing, move to quarantine or reject at your DNS host.',
  },
];

export const SECURITY_PAGE_HELP: PageHelp = {
  about: 'What leaves this server more open than it needs to be, most serious first, checked each time the page opens.',
  tasks: [
    'Work down the list. There is no score: an item is to do, accepted, or passed.',
    'Fix an item in one click. The change is shown first, and the message after it has Undo.',
    'Accept an item you’ve decided to live with, saying why. Every administrator sees the note, and the item comes back if the setting changes.',
    'Turn legacy mail protocols off, all at once or one at a time, after seeing who still uses them.',
  ],
  options: SECURITY_CHECK_HELP.map((c) => ({ label: `${c.check} · ${c.label}`, text: c.text })),
  optionsTitle: 'The checks',
};
