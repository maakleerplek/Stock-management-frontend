import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import basicSsl from '@vitejs/plugin-basic-ssl'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      tailwindcss(),
      basicSsl(), 
      svgr(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'apple-touch-icon.png'],
        manifest: {
          name: 'Inventree Assistant',
          short_name: 'Stock Manager',
          description: 'Manage stock and checkout at HTL.',
          theme_color: '#3b82f6',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: 'pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png'
            },
            {
              src: 'pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      host: env.VITE_DEV_HOST || '0.0.0.0', // Configurable via .env, defaults to all network interfaces
      port: parseInt(env.VITE_DEV_PORT || '5173'), // Configurable via .env, defaults to 5173
      proxy: {
        '/api': {
          target: env.INVENTREE_BACKEND_URL || 'http://127.0.0.1:8001',
          changeOrigin: true,
          secure: false,
        },
        '/media': {
          target: env.INVENTREE_BACKEND_URL || 'http://127.0.0.1:8001',
          changeOrigin: true,
          secure: false,
        }
      }
    },
    preview: {
      host: env.VITE_DEV_HOST || '0.0.0.0',
      port: parseInt(env.VITE_PREVIEW_PORT || '4173'),
    },
    optimizeDeps: {
      exclude: ['@emotion/use-insertion-effect-with-fallbacks'],
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            scanner: ['@yudiel/react-qr-scanner'],
            motion: ['motion'],
          },
        },
      },
    },
  }
})