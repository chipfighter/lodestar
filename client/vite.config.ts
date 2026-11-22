import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const version = (JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }).version

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  define: { __APP_VERSION__: JSON.stringify(version) },
  // The plugin's own logic (groups, wildcards, Agents, library.json) is shared, not copied.
  resolve: { alias: { '@shared/listing': fileURLToPath(new URL('../plugin/hooks/listing.ts', import.meta.url)) } },
  server: {
    port: 1420,
    strictPort: true,
    // The shared file and the plugin's defaults sit beside this folder.
    fs: { allow: ['..'] },
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  // The page is loaded from the app's own files, never over a network, so its size costs nothing to speak of.
  build: { target: 'chrome120', outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 4096 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
