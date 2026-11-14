import { defineConfig } from 'vite'
import path from 'path'

// Builds analytics/server.ts into one Node file. The browser session module is swapped for a stub;
// the InvenTree base URL stays empty because the server's fetch shim routes the relative paths.
export default defineConfig({
  resolve: { alias: [{ find: /^(\.\.\/)+auth\/session$/, replacement: path.resolve(__dirname, 'analytics/sessionStub.ts') }] },
  define: { 'import.meta.env.VITE_INVENTREE_URL': '""' },
  ssr: { noExternal: true },
  build: {
    ssr: 'analytics/server.ts',
    outDir: 'dist-analytics',
    target: 'node22',
    rollupOptions: { output: { entryFileNames: 'server.js', format: 'es' } },
  },
})
