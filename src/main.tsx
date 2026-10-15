import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App'

// The laser timer bar (laser-timer-widget sets LASER_SERVER) runs for days and
// needs the server anyway. A service worker kept it on an old build whose
// chunks were gone (PDF invoice failed, no animation), so it gets none: drop
// any old worker and its cache, and reload once if it was serving this page.
if ('LASER_SERVER' in window) {
  const controlled = !!navigator.serviceWorker?.controller
  Promise.all([
    navigator.serviceWorker?.getRegistrations().then(regs => Promise.all(regs.map(r => r.unregister()))),
    window.caches?.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))),
  ]).then(() => { if (controlled) window.location.reload() }, () => {})
} else {
  registerSW({ immediate: true })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
