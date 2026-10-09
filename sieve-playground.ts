// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only
/**
 * inbuxa: ships the Sieve playground with the console. `sieve-playground/`
 * holds the playground built by inbuxa-server's tools/sieve-playground (its
 * page, scripts and the server's Sieve interpreter as WebAssembly); Monaco,
 * the editor it loads, comes from node_modules. Both go into
 * `sieve-playground/<hash>/`, named after their contents: the server caches
 * every file but the console's index.html for good, so a new build has to
 * live at a new path. The console finds it through __SIEVE_PLAYGROUND__.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'

const ROOT = import.meta.dirname
const PLAYGROUND = path.join(ROOT, 'sieve-playground')
const MONACO = path.join(ROOT, 'node_modules', 'monaco-editor')

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

function walk(dir: string, prefix: string, out: Map<string, string>) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const source = path.join(dir, entry.name)
    const target = `${prefix}${entry.name}`
    if (entry.isDirectory()) walk(source, `${target}/`, out)
    else out.set(target, source)
  }
}

/** Published path → file on disk. */
function collect(): Map<string, string> {
  const files = new Map<string, string>()
  walk(PLAYGROUND, '', files)
  files.delete('SOURCE.md')

  const monaco = JSON.parse(readFileSync(path.join(MONACO, 'package.json'), 'utf8')) as {
    version: string
  }
  const vendor = `vendor/monaco-${monaco.version}`
  const index = readFileSync(path.join(PLAYGROUND, 'index.html'), 'utf8')
  if (!index.includes(`./${vendor}/vs/loader.js`)) {
    throw new Error(
      `sieve-playground/index.html does not load ${vendor}: monaco-editor in package.json and the playground disagree.`,
    )
  }
  // Only the editor core, as the playground's own build did.
  files.set(`${vendor}/vs/loader.js`, path.join(MONACO, 'min', 'vs', 'loader.js'))
  walk(path.join(MONACO, 'min', 'vs', 'base'), `${vendor}/vs/base/`, files)
  walk(path.join(MONACO, 'min', 'vs', 'editor'), `${vendor}/vs/editor/`, files)
  files.set(`${vendor}/LICENSE`, path.join(MONACO, 'LICENSE'))
  return files
}

export function sievePlayground(): Plugin {
  const files = collect()
  const hash = createHash('sha256')
  for (const name of [...files.keys()].sort()) {
    hash.update(name).update('\0').update(readFileSync(files.get(name)!)).update('\0')
  }
  const dir = `sieve-playground/${hash.digest('hex').slice(0, 16)}`

  return {
    name: 'inbuxa-sieve-playground',
    config: () => ({
      define: { __SIEVE_PLAYGROUND__: JSON.stringify(`${dir}/index.html`) },
    }),
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const prefix = `/${dir}/`
        const source = url.pathname.startsWith(prefix)
          ? files.get(decodeURIComponent(url.pathname.slice(prefix.length)))
          : undefined
        if (!source) return next()
        res.setHeader('Content-Type', CONTENT_TYPES[path.extname(source)] ?? 'application/octet-stream')
        res.end(readFileSync(source))
      })
    },
    generateBundle() {
      for (const [name, source] of files) {
        this.emitFile({ type: 'asset', fileName: `${dir}/${name}`, source: readFileSync(source) })
      }
    },
  }
}
