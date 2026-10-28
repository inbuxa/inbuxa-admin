// SPDX-FileCopyrightText: 2026 Coffey Labs LLC
// SPDX-License-Identifier: AGPL-3.0-only

// defineConfig from vitest/config, not vite, so the `test` section is typed.
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { configDefaults, defineConfig } from 'vitest/config'

import inbuxa from './inbuxa-version.json' with { type: 'json' }
import { sievePlayground } from './sieve-playground.ts'

export default defineConfig({
  // Relative, so one build works at any mount point (/admin, /account).
  base: './',
  define: {
    // The release version as tags name it (27.1, 27.1.3, 27.1-rc.1). Only
    // inbuxa's: package.json's is a leftover nothing shows.
    __APP_VERSION__: JSON.stringify(inbuxa.version),
  },
  plugins: [react(), tailwindcss(), sievePlayground()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, './src') } },
  test: {
    environment: 'happy-dom',
    globals: false,
    exclude: [...configDefaults.exclude, '**/.ignore/**'],
  },
})
