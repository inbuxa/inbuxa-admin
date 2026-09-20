// defineConfig comes from vitest/config rather than vite, which is what puts
// the `test` key below in scope. It replaces a triple-slash reference that did
// the same job and that eslint rejects.
import { configDefaults, defineConfig } from 'vitest/config'
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
    __APP_VERSION__: JSON.stringify(`${inbuxa.version} (base ${version})`),
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
