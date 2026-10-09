import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import LaserWidget from './LaserWidget'

// The lasercutter PC's always-on-top timer: only the widget, no stock app.
const isWidget = window.location.hash === '#laser-widget'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isWidget ? <LaserWidget /> : <App />}
  </StrictMode>,
)
