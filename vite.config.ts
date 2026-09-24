import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import basicSsl from '@vitejs/plugin-basic-ssl'
import svgr from 'vite-plugin-svgr'
import { VitePWA } from 'vite-plugin-pwa'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import type { Plugin } from 'vite'
import { requiredAccess, VOLUNTEER_CHECK_PATH } from './src/lib/apiAccess'

/**
 * Dev-server twin of the nginx access rules: the InvenTree token stays on the
 * server, and volunteer-only calls need a session. There is no Authentik in
 * development, so signing in just sets a cookie; DEV_VOLUNTEER=false in .env
 * turns sign-in off to test the till's view.
 */
const DEV_SESSION = 'dev_volunteer=1'

function apiAccess(allowSignIn: boolean): Plugin {
  return {
    name: 'api-access',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url ?? ''
        const pathOnly = url.split('?')[0]
        if (pathOnly === '/oauth/start') {
          const rd = new URL(url, 'https://dev').searchParams.get('rd') || '/'
          res.statusCode = 302
          if (allowSignIn) res.setHeader('Set-Cookie', `${DEV_SESSION}; Path=/; SameSite=Lax`)
          res.setHeader('Location', rd.startsWith('/') ? rd : '/')
          return res.end()
        }
        if (pathOnly === '/logout') {
          res.statusCode = 302
          res.setHeader('Set-Cookie', 'dev_volunteer=; Path=/; Max-Age=0')
          res.setHeader('Location', '/')
          return res.end()
        }
        if (!url.startsWith('/api/')) return next()
        const isVolunteer = allowSignIn && (req.headers.cookie ?? '').includes(DEV_SESSION)
        if (pathOnly === VOLUNTEER_CHECK_PATH) {
          res.statusCode = isVolunteer ? 204 : 401
          return res.end()
        }
        if (requiredAccess(req.method ?? 'GET', pathOnly) === 'volunteer' && !isVolunteer) {
          res.statusCode = 401
          return res.end()
        }
        next()
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Server-side only. The VITE_ names are accepted for older .env files; the
  // client code never reads them, so they do not end up in the bundle.
  const inventreeToken = env.INVENTREE_TOKEN || env.VITE_INVENTREE_TOKEN || ''
  const allowSignIn = env.DEV_VOLUNTEER !== 'false'
  const backend = env.INVENTREE_BACKEND_URL || 'http://127.0.0.1:8001'
  const proxyTarget = { target: backend, changeOrigin: true, secure: false, headers: { Authorization: `Token ${inventreeToken}` } }

  return {
    plugins: [
      react(),
      apiAccess(allowSignIn),
      tailwindcss(),
      basicSsl(), 
      svgr(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.png', 'favicon.ico', 'apple-touch-icon.png'],
        manifest: {
          name: 'Inventree Assistant',
          short_name: 'Stock Manager',
          description: 'Manage stock and checkout at HTL.',
          theme_color: '#171717',
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
        '/api': proxyTarget,
        '/media': proxyTarget,
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