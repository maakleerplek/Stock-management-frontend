import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { PublicClientApplication, EventType, type AuthenticationResult } from '@azure/msal-browser'
import { MsalProvider } from '@azure/msal-react'
import './index.css'
import App from './App'
import { msalConfig, isMsalConfigured } from './auth/msalConfig'

function render(content: ReactNode) {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>{content}</StrictMode>,
  )
}

if (isMsalConfigured) {
  const msalInstance = new PublicClientApplication(msalConfig)

  // MSAL v3+ must be initialized before use; this also processes any pending
  // redirect response so the account is ready before the app renders.
  msalInstance.initialize().then(() => {
    const accounts = msalInstance.getAllAccounts()
    if (accounts.length > 0) {
      msalInstance.setActiveAccount(accounts[0])
    }

    msalInstance.addEventCallback((event) => {
      if (event.eventType === EventType.LOGIN_SUCCESS && event.payload) {
        msalInstance.setActiveAccount((event.payload as AuthenticationResult).account)
      }
    })

    render(
      <MsalProvider instance={msalInstance}>
        <App />
      </MsalProvider>,
    )
  })
} else {
  // Azure not configured yet — run without MSAL (password fallback still works).
  render(<App />)
}
