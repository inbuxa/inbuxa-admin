/*
 * SPDX-FileCopyrightText: 2026 Coffey Labs
 *
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * Where is a domain's DNS hosted? Found the way any resolver would: the SOA
 * record names the zone that holds the domain (which may be a parent zone),
 * and the zone's NS records name the host. The host is then matched against
 * nameserver patterns we know for the providers the server can drive.
 */
import { dohQuery } from './liveCheck';

export interface DnsHosting {
  /** The zone holding the domain, e.g. example.com for mail.example.com. */
  zone: string;
  nameservers: string[];
  /** The server's provider type, when the host is one it can update. */
  variant: string | null;
}

/**
 * Nameserver suffixes by provider type. Only hosts whose nameservers are
 * unambiguous are listed: a wrong guess costs the user more than no guess.
 */
const NAMESERVERS: [RegExp, string][] = [
  [/\.ns\.cloudflare\.com$/, 'Cloudflare'],
  [/\.awsdns-\d+\.(com|net|org|co\.uk)$/, 'Route53'],
  [/^ns-cloud-[a-z]\d+\.googledomains\.com$/, 'GoogleCloudDns'],
  [/\.azure-dns\.(com|net|org|info)$/, 'AzureDns'],
  [/^ns\d\.digitalocean\.com$/, 'DigitalOcean'],
  [/\.ns\.hetzner\.(com|de)$/, 'Hetzner'],
  [/\.(ovh\.net|ovh\.ca|anycast\.me)$/, 'Ovh'],
  [/\.domaincontrol\.com$/, 'Godaddy'],
  [/\.porkbun\.com$/, 'Porkbun'],
  [/^ns\d\.desec\.(io|org)$/, 'DeSEC'],
  [/\.linode\.com$/, 'Linode'],
  [/\.vultr\.com$/, 'Vultr'],
  [/\.gandi\.net$|\.gandi-ns\.(fr|com|net)$/, 'GandiV5'],
  [/\.registrar-servers\.com$/, 'Namecheap'],
  [/\.dnsimple(-edge)?\.(com|net|org|info)$/, 'Dnsimple'],
  [/\.bunny\.net$/, 'Bunny'],
  [/\.nsone\.net$/, 'Ns1'],
  [/\.ui-dns\.(com|de|org|biz)$/, 'Ionos'],
  [/\.dnsmadeeasy\.com$/, 'DnsMadeEasy'],
  [/\.cloudns\.net$/, 'ClouDns'],
  [/^ns\d\.he\.net$/, 'Hurricane'],
  [/\.vercel-dns\.com$/, 'Vercel'],
  [/\.name\.com$/, 'NameDotCom'],
  [/\.inwx\.(de|net|eu)$/, 'Inwx'],
  [/\.transip\.(nl|net|eu)$/, 'Transip'],
  [/\.scw\.cloud$/, 'Scaleway'],
  [/\.infomaniak\.ch$/, 'Infomaniak'],
  [/\.dns-parking\.com$/, 'Hostinger'],
  [/\.akam\.net$/, 'EdgeDns'],
  [/\.exoscale\.(ch|net|io|com)$/, 'Exoscale'],
  [/\.netcup\.net$/, 'Netcup'],
  [/\.joker\.com$/, 'Joker'],
  [/\.glesys\.se$/, 'Glesys'],
  [/\.dreamhost\.com$/, 'Dreamhost'],
  [/\.easydns\.(com|net|org|info)$/, 'EasyDns'],
  [/\.ultradns\.(com|net|org|biz|info|co\.uk)$/, 'UltraDns'],
  [/\.mythic-beasts\.com$/, 'MythicBeasts'],
  [/\.luadns\.net$/, 'LuaDns'],
  [/\.spaceship\.net$/, 'Spaceship'],
  [/\.hosting\.de$/, 'HostingDe'],
];

/** The provider type for a set of nameservers, if they all point to one we know. */
export function providerForNameservers(nameservers: string[]): string | null {
  const hits = new Set<string>();
  for (const ns of nameservers) {
    const host = ns.toLowerCase().replace(/\.$/, '');
    const match = NAMESERVERS.find(([re]) => re.test(host));
    if (!match) return null;
    hits.add(match[1]);
  }
  return hits.size === 1 ? [...hits][0] : null;
}

/** Find the zone and host for a domain; null when it isn't in public DNS yet. */
export async function detectHosting(domain: string, signal?: AbortSignal): Promise<DnsHosting | null> {
  const soa = await dohQuery(domain, 'SOA', signal);
  const zoneRecord = [...soa.answer, ...soa.authority].find((a) => a.type === 6);
  const zone = zoneRecord?.name.replace(/\.$/, '').toLowerCase();
  // NXDOMAIN answers carry the TLD's SOA: that's "not registered", not a zone.
  if (!zone || !zone.includes('.') || soa.status === 3) return null;
  const ns = await dohQuery(zone, 'NS', signal);
  const nameservers = ns.answer.filter((a) => a.type === 2).map((a) => a.data.replace(/\.$/, '').toLowerCase());
  if (nameservers.length === 0) return null;
  return { zone, nameservers, variant: providerForNameservers(nameservers) };
}
