/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * INBUXA: DLP and mail flow rules (dlp-and-mail-flow-rules spec, §2.2–§2.4):
 * the rule as the server stores it, the detectors and templates it can
 * use, and each rule described in words for the form's preview.
 */

export type Kind = 'dlp' | 'transport';
export type Direction = 'outgoing' | 'incoming' | 'any';
export type Position = 'top' | 'bottom';

export interface DetectorMin {
  id: string;
  atLeast: number;
}

export type Condition =
  | { type: 'senderAddress'; addresses: string[] }
  | { type: 'senderDomain'; domains: string[] }
  | { type: 'recipientAddress'; addresses: string[] }
  | { type: 'recipientDomain'; domains: string[] }
  | { type: 'recipientOutside' }
  | { type: 'words'; words: string[]; atLeast: number }
  | { type: 'pattern'; pattern: string; atLeast: number }
  | { type: 'header'; name: string; contains?: string | null; matches?: string | null }
  | { type: 'attachmentType'; types: string[] }
  | { type: 'attachmentExtension'; extensions: string[] }
  | { type: 'attachmentName'; pattern: string }
  | { type: 'attachmentSizeOver'; bytes: number }
  | { type: 'attachmentCountOver'; count: number }
  | { type: 'cantBeInspected' }
  | { type: 'messageSizeOver'; bytes: number }
  | { type: 'detected'; detectors: DetectorMin[] }
  // Group and tenant ids, as JMAP ids
  | { type: 'senderGroup'; groups: string[] }
  | { type: 'senderTenant'; tenants: string[] }
  | { type: 'recipientGroup'; groups: string[] };

export type Action =
  | { type: 'addDisclaimer'; text: string; html?: string | null; position: Position }
  | { type: 'addHeader'; name: string; value: string }
  | { type: 'removeHeader'; name: string }
  | { type: 'prefixSubject'; text: string }
  | { type: 'addRecipient'; address: string }
  | { type: 'redirect'; addresses: string[] }
  | { type: 'refuse'; text: string }
  | { type: 'route'; queue: string }
  | { type: 'block'; notice: string }
  | { type: 'warn'; notice: string }
  | { type: 'hold'; notice: string; notifySender?: boolean };

export interface Rule {
  id?: string;
  name: string;
  description: string;
  kind: Kind;
  enabled: boolean;
  priority: number;
  direction: Direction;
  conditions: Condition[];
  exceptions: Condition[];
  actions: Action[];
  stopProcessing: boolean;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Detector {
  id: string;
  name: string;
  region: string;
  needsWord: boolean;
}

export interface Template {
  id: string;
  name: string;
  detectors: string[];
}

/** Generated from the server's detector tables (crates/features/src/mailflow/detectors). */
export const DETECTORS: Detector[] = [
  { id: 'payment-card', name: 'Payment card number', region: 'Any', needsWord: false },
  { id: 'iban', name: 'IBAN', region: 'Any', needsWord: false },
  { id: 'swift-bic', name: 'SWIFT/BIC code', region: 'Any', needsWord: true },
  { id: 'email-addresses', name: 'Email addresses', region: 'Any', needsWord: false },
  { id: 'phone-numbers', name: 'Phone numbers', region: 'Any', needsWord: true },
  { id: 'date-of-birth', name: 'Date of birth', region: 'Any', needsWord: true },
  { id: 'passport', name: 'Passport number', region: 'Any', needsWord: true },
  { id: 'private-key', name: 'Private key', region: 'Any', needsWord: false },
  { id: 'credentials', name: 'Cloud and service credentials', region: 'Any', needsWord: false },
  { id: 'us-ssn', name: 'US Social Security number', region: 'Us', needsWord: false },
  { id: 'us-itin', name: 'US ITIN', region: 'Us', needsWord: false },
  { id: 'us-ein', name: 'US EIN', region: 'Us', needsWord: true },
  { id: 'us-aba-routing', name: 'US bank routing number', region: 'Us', needsWord: true },
  { id: 'us-drivers-license', name: "US driver's license", region: 'Us', needsWord: true },
  { id: 'us-mbi', name: 'US Medicare Beneficiary Identifier', region: 'Us', needsWord: false },
  { id: 'us-npi', name: 'US National Provider Identifier', region: 'Us', needsWord: true },
  { id: 'us-dea', name: 'US DEA registration number', region: 'Us', needsWord: false },
  { id: 'uk-nino', name: 'UK National Insurance number', region: 'Uk', needsWord: false },
  { id: 'uk-nhs', name: 'UK NHS number', region: 'Uk', needsWord: false },
  { id: 'uk-utr', name: 'UK Unique Taxpayer Reference', region: 'Uk', needsWord: true },
  { id: 'ca-sin', name: 'Canadian Social Insurance Number', region: 'Canada', needsWord: false },
  { id: 'au-tfn', name: 'Australian Tax File Number', region: 'Australia', needsWord: false },
  { id: 'au-medicare', name: 'Australian Medicare number', region: 'Australia', needsWord: false },
  { id: 'de-tax-id', name: 'Germany: tax ID (Steuer-ID)', region: 'Eu', needsWord: false },
  { id: 'de-id-card', name: 'Germany: ID card number', region: 'Eu', needsWord: false },
  { id: 'fr-nir', name: 'France: social security number (NIR)', region: 'Eu', needsWord: false },
  { id: 'es-dni-nie', name: 'Spain: DNI and NIE', region: 'Eu', needsWord: false },
  { id: 'it-codice-fiscale', name: 'Italy: codice fiscale', region: 'Eu', needsWord: false },
  { id: 'nl-bsn', name: 'Netherlands: BSN', region: 'Eu', needsWord: false },
  { id: 'be-national-number', name: 'Belgium: national number', region: 'Eu', needsWord: false },
  { id: 'pl-pesel', name: 'Poland: PESEL', region: 'Eu', needsWord: false },
  { id: 'se-personnummer', name: 'Sweden: personnummer', region: 'Eu', needsWord: false },
  { id: 'dk-cpr', name: 'Denmark: CPR number', region: 'Eu', needsWord: true },
  { id: 'fi-hetu', name: 'Finland: personal identity code', region: 'Eu', needsWord: false },
  { id: 'ie-pps', name: 'Ireland: PPS number', region: 'Eu', needsWord: false },
  { id: 'pt-nif', name: 'Portugal: NIF', region: 'Eu', needsWord: false },
  { id: 'at-svnr', name: 'Austria: social insurance number', region: 'Eu', needsWord: false },
  { id: 'no-fnr', name: 'Norway: national identity number', region: 'Europe', needsWord: false },
  { id: 'ch-ahv', name: 'Switzerland: AHV number', region: 'Europe', needsWord: false },
  { id: 'in-aadhaar', name: 'India: Aadhaar', region: 'Asia', needsWord: false },
  { id: 'in-pan', name: 'India: PAN', region: 'Asia', needsWord: true },
  { id: 'cn-resident-id', name: 'China: resident ID', region: 'Asia', needsWord: false },
  { id: 'jp-my-number', name: 'Japan: My Number', region: 'Asia', needsWord: false },
  { id: 'sg-nric', name: 'Singapore: NRIC and FIN', region: 'Asia', needsWord: false },
  { id: 'kr-rrn', name: 'South Korea: resident registration number', region: 'Asia', needsWord: true },
  { id: 'br-cpf', name: 'Brazil: CPF', region: 'Americas', needsWord: false },
  { id: 'br-cnpj', name: 'Brazil: CNPJ', region: 'Americas', needsWord: false },
  { id: 'mx-curp', name: 'Mexico: CURP', region: 'Americas', needsWord: false },
  { id: 'za-id', name: 'South Africa: ID number', region: 'Africa', needsWord: false },
];

export const TEMPLATES: Template[] = [
  {
    id: 'payment-and-bank',
    name: 'Payment cards and bank accounts',
    detectors: ['payment-card', 'iban', 'swift-bic', 'us-aba-routing'],
  },
  {
    id: 'us-personal',
    name: 'US personal identifiers',
    detectors: ['us-ssn', 'us-itin', 'us-ein', 'us-drivers-license', 'passport', 'date-of-birth'],
  },
  {
    id: 'uk-personal',
    name: 'UK personal identifiers',
    detectors: ['uk-nino', 'uk-utr', 'uk-nhs', 'passport', 'date-of-birth'],
  },
  {
    id: 'eu-national',
    name: 'EU national identifiers',
    detectors: [
      'de-tax-id',
      'de-id-card',
      'fr-nir',
      'es-dni-nie',
      'it-codice-fiscale',
      'nl-bsn',
      'be-national-number',
      'pl-pesel',
      'se-personnummer',
      'dk-cpr',
      'fi-hetu',
      'ie-pps',
      'pt-nif',
      'at-svnr',
    ],
  },
  { id: 'health', name: 'Health identifiers', detectors: ['uk-nhs', 'us-mbi', 'us-npi', 'us-dea', 'au-medicare'] },
  { id: 'credentials', name: 'Credentials and keys', detectors: ['private-key', 'credentials'] },
  { id: 'contact-lists', name: 'Contact lists', detectors: ['email-addresses', 'phone-numbers'] },
];

export function detectorName(id: string): string {
  return DETECTORS.find((d) => d.id === id)?.name ?? id;
}

/** A new rule of a kind, ready for the form. */
export function newRule(kind: Kind): Rule {
  return kind === 'dlp'
    ? {
        name: '',
        description: '',
        kind,
        enabled: true,
        priority: 10,
        direction: 'outgoing',
        conditions: [{ type: 'recipientOutside' }, { type: 'detected', detectors: [] }],
        exceptions: [],
        actions: [{ type: 'warn', notice: '' }],
        stopProcessing: false,
      }
    : {
        name: '',
        description: '',
        kind,
        enabled: true,
        priority: 10,
        direction: 'outgoing',
        conditions: [],
        exceptions: [],
        actions: [{ type: 'addDisclaimer', text: '', position: 'bottom' }],
        stopProcessing: false,
      };
}

function list(items: string[], none = 'nothing'): string {
  if (items.length === 0) return none;
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}

function size(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} bytes`;
}

export function describeCondition(c: Condition): string {
  switch (c.type) {
    case 'senderAddress':
      return `the sender is ${list(c.addresses)}`;
    case 'senderDomain':
      return `the sender is at ${list(c.domains)}`;
    case 'senderGroup':
      return c.groups.length === 1
        ? 'the sender is in the chosen group'
        : `the sender is in one of ${c.groups.length} groups`;
    case 'senderTenant':
      return c.tenants.length === 1
        ? 'the sender is in the chosen tenant'
        : `the sender is in one of ${c.tenants.length} tenants`;
    case 'recipientAddress':
      return `a recipient is ${list(c.addresses)}`;
    case 'recipientDomain':
      return `a recipient is at ${list(c.domains)}`;
    case 'recipientGroup':
      return c.groups.length === 1
        ? 'a recipient is in the chosen group'
        : `a recipient is in one of ${c.groups.length} groups`;
    case 'recipientOutside':
      return 'a recipient is outside this server';
    case 'words':
      return `the message contains ${c.atLeast > 1 ? `${c.atLeast} or more of ` : ''}${list(c.words.map((w) => `“${w}”`))}`;
    case 'pattern':
      return `the message matches /${c.pattern}/${c.atLeast > 1 ? ` ${c.atLeast} or more times` : ''}`;
    case 'header':
      return c.contains
        ? `the ${c.name} header contains “${c.contains}”`
        : c.matches
          ? `the ${c.name} header matches /${c.matches}/`
          : `the message has a ${c.name} header`;
    case 'attachmentType':
      return `an attachment is ${list(c.types)}`;
    case 'attachmentExtension':
      return `an attachment ends in ${list(c.extensions.map((e) => `.${e.replace(/^\./, '')}`))}`;
    case 'attachmentName':
      return `an attachment's name matches /${c.pattern}/`;
    case 'attachmentSizeOver':
      return `an attachment is over ${size(c.bytes)}`;
    case 'attachmentCountOver':
      return `there are more than ${c.count} attachments`;
    case 'cantBeInspected':
      return 'an attachment can’t be inspected';
    case 'messageSizeOver':
      return `the message is over ${size(c.bytes)}`;
    case 'detected':
      return `the message contains ${list(
        c.detectors.map((d) => `${d.atLeast > 1 ? `${d.atLeast} or more ` : ''}${detectorName(d.id)}`),
        'no detectors yet',
      )}`;
  }
}

export function describeAction(a: Action): string {
  switch (a.type) {
    case 'addDisclaimer':
      return `add a disclaimer at the ${a.position}`;
    case 'addHeader':
      return `add the header ${a.name}: ${a.value}`;
    case 'removeHeader':
      return `remove the ${a.name} header`;
    case 'prefixSubject':
      return `start the subject with “${a.text}”`;
    case 'addRecipient':
      return `send a copy to ${a.address}`;
    case 'redirect':
      return `send it to ${list(a.addresses)} instead`;
    case 'refuse':
      return 'refuse it';
    case 'route':
      return `send it through the ${a.queue} queue`;
    case 'block':
      return 'block it';
    case 'warn':
      return 'warn the sender, who may send anyway with a reason';
    case 'hold':
      return 'hold it for review';
  }
}

/** "If a recipient is outside … and …, unless …, hold it for review." */
export function describeRule(rule: Rule): string {
  const direction =
    rule.kind === 'dlp' || rule.direction === 'outgoing'
      ? 'mail sent from here'
      : rule.direction === 'incoming'
        ? 'mail arriving here'
        : 'any mail';
  const when = rule.conditions.length
    ? `If ${rule.conditions.map(describeCondition).join(' and ')}`
    : `For all ${direction}`;
  const unless = rule.exceptions.length ? `, unless ${rule.exceptions.map(describeCondition).join(' or ')}` : '';
  const then = rule.actions.length ? rule.actions.map(describeAction).join(', then ') : 'do nothing';
  return `${when}${unless}: ${then}.`;
}
