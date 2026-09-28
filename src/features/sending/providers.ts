/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * inbuxa: relay services the sending setup knows (settings-reorg, guided
 * setup 1). Each preset fills in the host, port and TLS mode, and says where
 * the SMTP credentials are found. Implicit TLS on 465 wherever the service
 * offers it, so the sign-in never crosses the wire unencrypted; a service
 * that only takes STARTTLS gets it required instead (see plan.ts).
 */

export interface RelayPreset {
  id: string;
  name: string;
  /** Regions, where the host depends on one. */
  regions?: { id: string; label: string; host: string }[];
  host: string;
  port: number;
  implicitTls: boolean;
  /** A fixed username, where the service uses one. */
  username?: string;
  usernameHint: string;
  passwordHint: string;
  /** What to do at the service before this works. */
  before: string;
}

const SES_REGIONS = [
  ['us-east-1', 'US East (N. Virginia)'],
  ['us-east-2', 'US East (Ohio)'],
  ['us-west-2', 'US West (Oregon)'],
  ['ca-central-1', 'Canada (Central)'],
  ['eu-west-1', 'Europe (Ireland)'],
  ['eu-west-2', 'Europe (London)'],
  ['eu-central-1', 'Europe (Frankfurt)'],
  ['eu-north-1', 'Europe (Stockholm)'],
  ['ap-south-1', 'Asia Pacific (Mumbai)'],
  ['ap-southeast-1', 'Asia Pacific (Singapore)'],
  ['ap-southeast-2', 'Asia Pacific (Sydney)'],
  ['ap-northeast-1', 'Asia Pacific (Tokyo)'],
  ['sa-east-1', 'South America (São Paulo)'],
].map(([id, label]) => ({ id, label, host: `email-smtp.${id}.amazonaws.com` }));

export const RELAY_PRESETS: RelayPreset[] = [
  {
    id: 'ses',
    name: 'Amazon SES',
    regions: SES_REGIONS,
    host: SES_REGIONS[0].host,
    port: 465,
    implicitTls: true,
    usernameHint: 'The SMTP user name from SES › SMTP settings › Create SMTP credentials. Not your AWS access key.',
    passwordHint: 'The SMTP password shown once when the SMTP credentials are created.',
    before:
      'Verify your domain in SES (it gives you DKIM records to add), and ask AWS to move the account out of the sandbox, or it can only send to verified addresses.',
  },
  {
    id: 'mailgun',
    name: 'Mailgun',
    regions: [
      { id: 'us', label: 'US', host: 'smtp.mailgun.org' },
      { id: 'eu', label: 'EU', host: 'smtp.eu.mailgun.org' },
    ],
    host: 'smtp.mailgun.org',
    port: 465,
    implicitTls: true,
    usernameHint: 'The SMTP login from your sending domain’s settings, usually postmaster@ followed by that domain.',
    passwordHint: 'The SMTP password for that login, from the same page.',
    before: 'Add and verify your sending domain in Mailgun. Pick the region your Mailgun account is in.',
  },
  {
    id: 'sendgrid',
    name: 'SendGrid',
    host: 'smtp.sendgrid.net',
    port: 465,
    implicitTls: true,
    username: 'apikey',
    usernameHint: 'SendGrid always uses the word apikey as the user name.',
    passwordHint: 'An API key with Mail Send permission, from Settings › API Keys.',
    before: 'Authenticate your domain in SendGrid (Settings › Sender Authentication).',
  },
  {
    id: 'postmark',
    name: 'Postmark',
    host: 'smtp.postmarkapp.com',
    port: 587,
    implicitTls: false,
    usernameHint: 'Your server’s API token, from the server’s API Tokens tab.',
    passwordHint: 'The same server API token again.',
    before: 'Add your domain as a sender signature in Postmark and add the DKIM and Return-Path records it shows.',
  },
  {
    id: 'brevo',
    name: 'Brevo',
    host: 'smtp-relay.brevo.com',
    port: 465,
    implicitTls: true,
    usernameHint: 'The login shown on the SMTP & API page (SMTP tab).',
    passwordHint: 'An SMTP key generated on that same page. Not your account password.',
    before: 'Authenticate your domain in Brevo (Senders, Domains & Dedicated IPs).',
  },
  {
    id: 'smtp2go',
    name: 'SMTP2GO',
    host: 'mail.smtp2go.com',
    port: 465,
    implicitTls: true,
    usernameHint: 'The user name of an SMTP user you add under Sending › SMTP Users.',
    passwordHint: 'That SMTP user’s password.',
    before: 'Verify your sender domain in SMTP2GO (Sending › Verified Senders).',
  },
  {
    id: 'other',
    name: 'Another relay',
    host: '',
    port: 465,
    implicitTls: true,
    usernameHint:
      'The user name your provider or ISP gave you for sending mail. Leave empty if the relay doesn’t ask for one.',
    passwordHint: 'The password that goes with it.',
    before:
      'Your ISP or provider’s help pages list the relay’s host name and port, often called the outgoing or SMTP server.',
  },
];

export function presetById(id: string): RelayPreset {
  return RELAY_PRESETS.find((p) => p.id === id) ?? RELAY_PRESETS[RELAY_PRESETS.length - 1];
}

/** The preset a saved relay most likely came from, by its host. */
export function presetForHost(host: string): RelayPreset {
  const h = host.trim().toLowerCase();
  return (
    RELAY_PRESETS.find((p) => p.id !== 'other' && (p.host === h || p.regions?.some((r) => r.host === h))) ??
    presetById('other')
  );
}
