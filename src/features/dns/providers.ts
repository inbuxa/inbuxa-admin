/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * The DNS providers the guided setup leads with, and how to get each one's
 * credentials. The server supports many more; they're all offered under
 * "Another provider", with their fields taken from the server's schema.
 *
 * `variant` is the server's name for the provider type. The steps are ours:
 * keep them short, and aim for the narrowest credential that works.
 */

export interface ProviderGuide {
  variant: string;
  name: string;
  /** One line on the tile. */
  blurb: string;
  /** How to make a credential, in order. */
  steps: string[];
  /** Where to start, on the provider's own site. */
  link?: string;
  /** The fields named the way the steps above name them. */
  fields?: Record<string, { label: string; hint?: string }>;
}

export const FEATURED: ProviderGuide[] = [
  {
    variant: 'Cloudflare',
    name: 'Cloudflare',
    blurb: 'An API token limited to this one zone.',
    steps: [
      'In the Cloudflare dashboard, open My Profile → API Tokens and choose Create Token.',
      'Use the "Edit zone DNS" template.',
      'Under Zone Resources, pick Include → Specific zone → your domain, so the token can touch nothing else.',
      'Create the token and paste it below. Cloudflare shows it only once.',
    ],
    link: 'https://dash.cloudflare.com/profile/api-tokens',
    fields: { secret: { label: 'API token', hint: 'The token from step 4.' } },
  },
  {
    variant: 'Route53',
    name: 'Amazon Route 53',
    blurb: 'An IAM access key allowed to change one hosted zone.',
    steps: [
      'In IAM, create a user or role for the mail server.',
      'Give it a policy that allows route53:ChangeResourceRecordSets and route53:ListResourceRecordSets on your hosted zone only, plus route53:ListHostedZonesByName.',
      'Create an access key for it and paste the key ID and secret below.',
    ],
    link: 'https://console.aws.amazon.com/iam/',
  },
  {
    variant: 'GoogleCloudDns',
    name: 'Google Cloud DNS',
    blurb: 'A service account with the DNS Administrator role.',
    steps: [
      'In IAM & Admin → Service Accounts, create an account for the mail server.',
      'Grant it the DNS Administrator role on the project that holds your zone.',
      'Create a JSON key for it and paste the details below.',
    ],
    link: 'https://console.cloud.google.com/iam-admin/serviceaccounts',
  },
  {
    variant: 'AzureDns',
    name: 'Azure DNS',
    blurb: 'An app registration with DNS Zone Contributor on your zone.',
    steps: [
      'Register an application in Microsoft Entra ID and create a client secret.',
      'On your DNS zone, open Access control (IAM) and give the app the DNS Zone Contributor role.',
      'Paste the tenant, client and subscription IDs and the secret below.',
    ],
    link: 'https://portal.azure.com/',
  },
  {
    variant: 'DigitalOcean',
    name: 'DigitalOcean',
    blurb: 'A personal access token with domain access.',
    steps: [
      'Open API → Tokens and generate a new token.',
      'Give it the "domain" scopes (read and update) only.',
      'Paste the token below.',
    ],
    link: 'https://cloud.digitalocean.com/account/api/tokens',
    fields: { secret: { label: 'Access token' } },
  },
  {
    variant: 'Hetzner',
    name: 'Hetzner DNS',
    blurb: 'A DNS API token.',
    steps: ['In the Hetzner DNS console, open API tokens and create one.', 'Paste the token below.'],
    link: 'https://dns.hetzner.com/settings/api-token',
    fields: { secret: { label: 'API token' } },
  },
  {
    variant: 'Ovh',
    name: 'OVHcloud',
    blurb: 'An application key and consumer key for the DNS API.',
    steps: [
      'Create API keys for your region, allowing GET, POST, PUT and DELETE on /domain/zone/*.',
      'Paste the application key, application secret and consumer key below.',
    ],
    link: 'https://api.ovh.com/createToken/',
  },
  {
    variant: 'Godaddy',
    name: 'GoDaddy',
    blurb: 'A production API key and secret.',
    steps: [
      'In the GoDaddy developer portal, create a Production API key.',
      'Paste the key and secret below. GoDaddy only allows API access on some account types.',
    ],
    link: 'https://developer.godaddy.com/keys',
  },
  {
    variant: 'Porkbun',
    name: 'Porkbun',
    blurb: 'An API key pair, with API access turned on for the domain.',
    steps: [
      'Open Account → API Access and create an API key.',
      'In Domain Management, turn on API Access for this domain.',
      'Paste the API key and secret below.',
    ],
    link: 'https://porkbun.com/account/api',
  },
  {
    variant: 'DeSEC',
    name: 'deSEC',
    blurb: 'A token, ideally limited to this domain.',
    steps: [
      'In deSEC, open Token Management and create a token.',
      'Restrict it to this domain if you can, and paste it below.',
    ],
    link: 'https://desec.io/tokens',
    fields: { secret: { label: 'Token' } },
  },
];

/** Provider types the guided setup doesn't offer: retired ones. */
export const HIDDEN_VARIANTS = new Set(['Deprecated1']);

/**
 * Fields the guided setup leaves at the server's defaults: timing and
 * bookkeeping. They stay editable on the DNS provider's own page.
 */
export const ADVANCED_FIELDS = new Set([
  'description',
  'memberTenantId',
  'pollingInterval',
  'propagationDelay',
  'propagationTimeout',
  'timeout',
  'ttl',
]);
