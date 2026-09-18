/// <reference types="vitest/config" />
import { configDefaults } from 'vitest/config'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { version } from './package.json' with { type: 'json' }
// INBUXA's own dated version lives apart from package.json, whose version
// follows upstream WebUI so its bumps merge without conflicts.
import inbuxa from './inbuxa-version.json' with { type: 'json' }

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(`${inbuxa.version} (WebUI ${version})`),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    globals: false,
    environment: 'happy-dom',
    exclude: [...configDefaults.exclude, '**/.ignore/**'],
  },
})
