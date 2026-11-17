// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only
//
// The image's nginx config and start scripts: every response carries the
// security headers, the policies allow what the console and the playground
// load, and nothing is written into the image's own files at start.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const HERE = import.meta.dirname
const read = (name: string) => readFileSync(path.join(HERE, name), 'utf8')
const config = read('nginx.conf')

/** Each location's body, by its match, and the server block's own lines. */
function blocks(): { server: string; locations: Map<string, string> } {
  const locations = new Map<string, string>()
  const server = config.replace(/^\s*location\s+([^{]+)\{([^}]*)\}/gm, (_, match: string, body: string) => {
    locations.set(match.trim(), body)
    return ''
  })
  return { server, locations }
}

const includes = (body: string, file: string) =>
  new RegExp(`^\\s*include\\s+\\S*/${file.replace('.', '\\.')};`, 'm').test(body)

describe('nginx.conf', () => {
  it('sends the security headers and a policy from the server block', () => {
    const { server } = blocks()
    expect(server).toMatch(/^server_tokens off;/m)
    expect(includes(server, 'security-headers.conf')).toBe(true)
    expect(includes(server, 'csp.conf')).toBe(true)
  })

  it('sends them again from every location that adds a header of its own', () => {
    const { locations } = blocks()
    expect(locations.size).toBeGreaterThan(3)
    for (const [match, body] of locations) {
      if (!/^\s*add_header\b/m.test(body) && !/^\s*include\b/m.test(body)) continue
      expect(includes(body, 'security-headers.conf'), match).toBe(true)
      expect(includes(body, 'csp.conf') || includes(body, 'playground-csp.conf'), match).toBe(true)
    }
  })

  it('serves index.html from where the start script writes it', () => {
    expect(blocks().locations.get('= /index.html')).toMatch(/^\s*root \/tmp\/inbuxa-admin;/m)
  })
})

describe('security-headers.conf', () => {
  it('denies framing, sniffing and full referrers, on every status', () => {
    const headers = read('security-headers.conf')
    expect(headers).toContain('add_header X-Frame-Options "DENY" always;')
    expect(headers).toContain('add_header X-Content-Type-Options "nosniff" always;')
    expect(headers).toContain('add_header Referrer-Policy "strict-origin-when-cross-origin" always;')
  })
})

const sha256 = (text: string) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`

describe('playground-csp.conf', () => {
  const policy = () => /Content-Security-Policy "([^"]+)" always;/.exec(read('playground-csp.conf'))![1]

  it("allows exactly the playground page's inline scripts and handlers", () => {
    const page = readFileSync(path.join(HERE, '..', 'sieve-playground', 'index.html'), 'utf8')
    const inline = [
      ...[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]),
      ...[...page.matchAll(/\son[a-z]+="([^"]*)"/g)].map((m) => m[1]),
    ]
    expect(inline.length).toBeGreaterThan(0)
    const allowed = policy().match(/'sha256-[^']+'/g) ?? []
    expect(allowed.sort()).toEqual(inline.map(sha256).sort())
  })

  it('cannot be framed', () => {
    expect(policy()).toContain("frame-ancestors 'none'")
    expect(policy()).not.toMatch(/script-src[^;]*'unsafe-inline'/)
  })
})

describe('index.html', () => {
  it('has no inline script, style or handler, which the policy would block', () => {
    const page = read(path.join('..', 'index.html'))
    expect(page).not.toMatch(/<script(?![^>]*\ssrc=)[^>]*>/)
    expect(page).not.toMatch(/<style\b/)
    expect(page).not.toMatch(/\son[a-z]+=/)
  })
})

describe('entrypoint.sh', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  /** Runs the start script against a copy of index.html; null when it refused. */
  function start(api?: string): { csp: string; html: string } | null {
    dir = mkdtempSync(path.join(tmpdir(), 'inbuxa-admin-'))
    const env: NodeJS.ProcessEnv = {
      PATH: process.env.PATH,
      INDEX_HTML: path.join(HERE, '..', 'index.html'),
      RUNTIME_DIR: path.join(dir, 'run'),
    }
    if (api !== undefined) env.API_BASE_URL = api
    try {
      execFileSync('sh', [path.join(HERE, 'entrypoint.sh')], { env, stdio: 'pipe' })
    } catch {
      expect(existsSync(path.join(dir, 'run', 'csp.conf'))).toBe(false)
      return null
    }
    const csp = readFileSync(path.join(dir, 'run', 'csp.conf'), 'utf8')
    return { csp, html: readFileSync(path.join(dir, 'run', 'index.html'), 'utf8') }
  }

  it('lets the console reach the server it names, and nothing else it does not need', () => {
    const { csp, html } = start('https://mail.example.com:8443/inbuxa/')!
    expect(html).toContain('<meta name="api-base-url" content="https://mail.example.com:8443/inbuxa/">')
    expect(csp).toBe(
      'add_header Content-Security-Policy "' +
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https: https://mail.example.com:8443; font-src 'self' data:; " +
        "connect-src 'self' https://mail.example.com:8443 https://cloudflare-dns.com; " +
        "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" +
        '" always;\n',
    )
  })

  it('without an address, allows only its own origin', () => {
    const { csp, html } = start()!
    expect(html).toBe(read(path.join('..', 'index.html')))
    expect(csp).toContain("connect-src 'self' https://cloudflare-dns.com;")
    expect(csp).toContain("img-src 'self' data: blob: https:;")
    expect(csp).not.toContain('  ')
  })

  it('takes an IPv6 address and plain http', () => {
    expect(start('http://[2001:db8::1]:8080')!.csp).toContain("connect-src 'self' http://[2001:db8::1]:8080 ")
  })

  it('refuses an address that would change the policy or the page', () => {
    for (const api of [
      'https://mail.example.com; script-src *',
      'https://mail.example.com" always; add_header X y',
      'https://mail.example.com/"><script>',
      'https://mail.example.com $host',
      'javascript:alert(1)',
      'mail.example.com',
      'https://user@mail.example.com',
      'https://mail.example.com,https://evil.example',
    ]) {
      expect(start(api), api).toBeNull()
    }
  })
})
